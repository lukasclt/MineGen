
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
  currentUser?: User | null
): Promise<GeneratedProject> => {
  
  const baseUrl = 'https://openrouter.ai/api/v1';
  
  // Prioridade: Chave salva no Perfil > Chave de Ambiente
  const apiKey = currentUser?.savedApiKey || process.env.API_KEY;

  if (!apiKey) {
    throw new Error("API Key não encontrada. Configure-a no seu Perfil (clique no avatar) ou no ambiente.");
  }

  let userPromptContext = "";

  if (previousProject && previousProject.files.length > 0) {
    const fileContext = previousProject.files
      .filter(f => !f.path.includes('.minegen'))
      .map(f => `FILE: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
      .join("\n\n");
      
    userPromptContext = `
# PROJETO ATUAL
${fileContext}

# SOLICITAÇÃO DE ALTERAÇÃO
${prompt}

Retorne o JSON com os arquivos modificados ou novos.
    `;
  } else {
    userPromptContext = `
# NOVO PROJETO MINECRAFT
Nome: ${settings.name}
Plataforma: ${settings.platform}
Java: ${settings.javaVersion}
Minecraft: ${settings.mcVersion}
Build: ${settings.buildSystem}

# REQUISITOS
${prompt}
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
        text: `\n--- ANEXO: ${att.name} ---\n${att.content}\n`
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
        // Alguns modelos gratuitos ignoram response_format ou quebram com ele.
        // Vamos tentar sem forçar, e confiar no parser robusto, a menos que seja um modelo da OpenAI/Google conhecido.
        response_format: settings.aiModel?.includes('gpt') || settings.aiModel?.includes('gemini') ? { type: "json_object" } : undefined,
        temperature: 0.2, // Baixa temperatura para código mais preciso
      }),
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
    console.log("[AI] Resposta bruta recebida (início):", rawContent.substring(0, 200) + "...");
    
    // Usa o parser robusto
    const project = extractJson(rawContent) as GeneratedProject;

    // Validação básica
    if (!project.files || !Array.isArray(project.files)) {
      throw new Error("O JSON retornado não contém uma lista de arquivos válida.");
    }

    // Injetar wrappers se necessário
    if (settings.buildSystem === BuildSystem.GRADLE && !previousProject) {
        if (!project.files.some(f => f.path.includes('gradlew'))) {
            project.files.push(
                { path: 'gradlew', content: GRADLEW_UNIX, language: 'text' },
                { path: 'gradlew.bat', content: GRADLEW_BAT, language: 'text' },
                { path: 'gradle/wrapper/gradle-wrapper.properties', content: GRADLE_WRAPPER_PROPERTIES, language: 'text' }
            );
        }
    }

    return project;
  } catch (e: any) {
    console.error("AI Generation Error Completo:", e);
    throw new Error(e.message || "Falha na comunicação com OpenRouter.");
  }
};
