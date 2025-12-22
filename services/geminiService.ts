
import { PluginSettings, GeneratedProject, Attachment, BuildSystem, User } from "../types";
import { SYSTEM_INSTRUCTION, GRADLEW_UNIX, GRADLEW_BAT, GRADLE_WRAPPER_PROPERTIES } from "../constants";

/**
 * Função auxiliar para extrair JSON de respostas "sujas" (com texto antes/depois ou markdown)
 */
function extractJson(text: string): any {
  try {
    // 1. Tenta parse direto
    return JSON.parse(text);
  } catch (e) {
    // 2. Tenta extrair de blocos de código markdown ```json ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (e2) {
        // Continua tentando...
      }
    }

    // 3. Tenta encontrar o primeiro '{' e o último '}'
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const potentialJson = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(potentialJson);
      } catch (e3) {
        console.error("Falha ao parsear JSON extraído:", potentialJson);
        throw new Error("A IA retornou um formato inválido. Tente outro modelo.");
      }
    }

    throw new Error("Nenhum JSON válido encontrado na resposta da IA.");
  }
}

/**
 * Serviço de integração com OpenRouter (API Unificada)
 */
export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings,
  previousProject?: GeneratedProject | null,
  attachments: Attachment[] = [],
  currentUser?: User | null,
  signal?: AbortSignal // Adicionado suporte a sinal de cancelamento
): Promise<GeneratedProject> => {
  
  const baseUrl = 'https://openrouter.ai/api/v1';
  
  // Prioridade: Chave salva no Perfil > Chave de Ambiente
  const apiKey = currentUser?.savedApiKey || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key não encontrada. Configure-a no seu Perfil (clique no avatar) ou no ambiente.");
  }

  let userPromptContext = "";

  // CONSTRUÇÃO DO PROMPT TIPO C (Context Injection)
  const projectContext = `
# PROJECT CONTEXT
- **Project Name**: ${settings.name}
- **Target Platform**: ${settings.platform}
- **Minecraft Version**: ${settings.mcVersion}
- **Java Version**: ${settings.javaVersion}
- **Build System**: ${settings.buildSystem}
- **Group ID**: ${settings.groupId}
- **Artifact ID**: ${settings.artifactId}
  `;

  if (previousProject && previousProject.files.length > 0) {
    const fileContext = previousProject.files
      .filter(f => !f.path.includes('.minegen') && !f.path.includes('gradlew'))
      .map(f => `FILE: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
      .join("\n\n");
      
    userPromptContext = `
${projectContext}

# EXISTING CODEBASE
The user is requesting changes to an existing project. Analyze the files below:
${fileContext}

# USER REQUEST
${prompt}

# INSTRUCTIONS
- Modify the existing files or create new ones to satisfy the request.
- Return the FULL content of any modified file.
- Do not remove existing functionality unless asked.
    `;
  } else {
    userPromptContext = `
${projectContext}

# NEW PROJECT REQUEST
The user wants to create a brand new plugin from scratch.

# USER REQUIREMENTS
${prompt}

# INSTRUCTIONS
- Scaffold a complete project structure.
- Include 'plugin.yml' (or 'paper-plugin.yml'/'bungee.yml'/'velocity-plugin.json' based on platform).
- Include the build file (${settings.buildSystem === BuildSystem.MAVEN ? 'pom.xml' : 'build.gradle'}).
- Create the Main class and any necessary packages.
    `;
  }

  const contentArray: any[] = [
    { type: "text", text: userPromptContext }
  ];

  attachments.forEach(att => {
    if (att.type === 'image') {
      contentArray.push({
        type: "image_url",
        image_url: { url: att.content }
      });
    } else {
      contentArray.push({
        type: "text",
        text: `\n--- ATTACHMENT: ${att.name} ---\n${att.content}\n`
      });
    }
  });

  try {
    console.log(`[AI] Enviando requisição para modelo: ${settings.aiModel}`);
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'MineGen AI Cloud',
      },
      body: JSON.stringify({
        model: settings.aiModel || "google/gemini-2.0-flash-exp:free",
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: contentArray }
        ],
        response_format: settings.aiModel?.includes('gpt') || settings.aiModel?.includes('gemini') ? { type: "json_object" } : undefined,
        temperature: 0.2, // Baixa temperatura para código preciso
        max_tokens: 8192, // Permitir respostas longas para projetos complexos
      }),
      signal: signal // Passa o sinal para o fetch
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Erro ${response.status}`;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg = errJson.error?.message || errorMsg;
      } catch {
        errorMsg = errorText || errorMsg;
      }
      throw new Error(`OpenRouter Error: ${errorMsg}`);
    }

    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error("A IA não retornou nenhuma resposta (choices vazio).");
    }

    const rawContent = data.choices[0].message.content;
    
    // Usa o parser robusto
    const project = extractJson(rawContent) as GeneratedProject;

    // Validação básica
    if (!project.files || !Array.isArray(project.files)) {
      throw new Error("O JSON retornado não contém uma lista de arquivos válida.");
    }

    // Injetar wrappers se necessário (apenas para Gradle)
    if (settings.buildSystem === BuildSystem.GRADLE) {
        const hasWrapper = project.files.some(f => f.path.includes('gradlew'));
        
        if (!hasWrapper) {
            project.files.push(
                { path: 'gradlew', content: GRADLEW_UNIX, language: 'text' },
                { path: 'gradlew.bat', content: GRADLEW_BAT, language: 'text' },
                { path: 'gradle/wrapper/gradle-wrapper.properties', content: GRADLE_WRAPPER_PROPERTIES, language: 'text' }
            );
        }
    }

    return project;
  } catch (e: any) {
    if (e.name === 'AbortError') {
        throw new Error("TIMEOUT");
    }
    console.error("AI Generation Error Completo:", e);
    throw new Error(e.message || "Falha na comunicação com OpenRouter.");
  }
};
