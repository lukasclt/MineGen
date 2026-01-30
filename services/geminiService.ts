
import { PluginSettings, GeneratedProject, Attachment, BuildSystem, User, AIProvider, GeneratedFile } from "../types";
import { SYSTEM_INSTRUCTION, GRADLEW_UNIX, GRADLEW_BAT, GRADLE_WRAPPER_PROPERTIES } from "../constants";

function extractJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (e2) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const potentialJson = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(potentialJson);
      } catch (e3) {
        throw new Error("Formato JSON inválido retornado pela IA.");
      }
    }
    throw new Error("Nenhum JSON encontrado na resposta.");
  }
}

export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings,
  previousProject?: GeneratedProject | null,
  attachments: Attachment[] = [],
  currentUser?: User | null,
  signal?: AbortSignal
): Promise<GeneratedProject> => {
  
  let baseUrl = 'https://openrouter.ai/api/v1';
  let apiKey = '';
  let providerHeader = {};

  if (settings.aiProvider === AIProvider.GITHUB_COPILOT) {
      baseUrl = 'https://models.inference.ai.azure.com';
      apiKey = currentUser?.githubToken || '';
      if (!apiKey) throw new Error("Token do GitHub não encontrado.");
  } else {
      baseUrl = 'https://openrouter.ai/api/v1';
      apiKey = currentUser?.savedApiKey || process.env.API_KEY || '';
      if (!apiKey) throw new Error("API Key do OpenRouter não encontrada.");
      providerHeader = {
          'HTTP-Referer': window.location.origin,
          'X-Title': 'MineGen AI Cloud',
      };
  }

  // --- CONTEXTO TRADUZIDO PARA PT-BR ---
  const projectContext = `
# CONTEXTO DO PROJETO
- **Nome**: ${settings.name}
- **Plataforma**: ${settings.platform}
- **Versão MC**: ${settings.mcVersion}
- **Java**: ${settings.javaVersion} (Requisito ESTRITO para Gradle)
- **Sistema de Build**: ${settings.buildSystem}
- **Group ID**: ${settings.groupId}
- **Artifact ID**: ${settings.artifactId}
  `;

  let userPromptContext = "";

  if (previousProject && previousProject.files.length > 0) {
    // Context Pruning (~20k chars)
    const MAX_CONTEXT_CHARS = 20000;
    let currentChars = 0;
    let fileContext = "";
    let skippedCount = 0;

    // Prioriza .github/workflows para que a IA saiba se o build existe
    const sortedFiles = [...previousProject.files].sort((a, b) => {
        const getScore = (f: GeneratedFile) => {
            if (f.path.includes('.github/workflows')) return 200; // ALTA PRIORIDADE PARA CI
            if (f.path.endsWith('build.gradle') || f.path.endsWith('pom.xml')) return 100;
            if (f.path.endsWith('plugin.yml') || f.path.endsWith('paper-plugin.yml')) return 90;
            if (f.path.endsWith('Main.java')) return 80;
            if (f.path.endsWith('.java')) return 50;
            return 10;
        };
        return getScore(b) - getScore(a);
    });

    for (const f of sortedFiles) {
        if (f.path.includes('.minegen') || f.path.includes('gradlew') || f.path.endsWith('.lock')) continue;
        
        const fileEntry = `ARQUIVO: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\`\n\n`;
        
        if (currentChars + fileEntry.length < MAX_CONTEXT_CHARS) {
            fileContext += fileEntry;
            currentChars += fileEntry.length;
        } else {
            skippedCount++;
        }
    }

    userPromptContext = `
${projectContext}

# CÓDIGO EXISTENTE
${fileContext}
${skippedCount > 0 ? `\n[... ${skippedCount} arquivos omitidos ...]` : ''}

# PEDIDO DO USUÁRIO
${prompt}

# INSTRUÇÕES ADICIONAIS
- Se o usuário pediu para consertar o "Build" ou "Actions", VERIFIQUE SE O ARQUIVO .github/workflows/gradle.yml ESTÁ PRESENTE E CORRETO. Se não, CRIE-O com permissões de 'contents: write'.
- Responda em Português.
    `;
  } else {
    userPromptContext = `
${projectContext}

# NOVO PROJETO
O usuário quer criar um plugin do zero.

# REQUISITOS DO USUÁRIO
${prompt}

# INSTRUÇÕES
- Crie a estrutura completa do projeto.
- OBRIGATÓRIO: Crie '.github/workflows/gradle.yml' para CI/CD com auto-release.
- Inclua 'plugin.yml' e 'build.gradle'.
- Responda em Português.
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
    console.log(`[AI] Req: ${settings.aiProvider} / ${settings.aiModel}`);
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...providerHeader
      },
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: contentArray }
        ],
        response_format: (settings.aiModel?.includes('gpt') || settings.aiModel?.includes('gemini')) ? { type: "json_object" } : undefined,
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Erro ${response.status}`;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg = errJson.error?.message || errorMsg;
      } catch {}
      throw new Error(`AI Provider Error: ${errorMsg}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) throw new Error("Resposta vazia da IA.");
    const rawContent = data.choices[0].message.content;
    const project = extractJson(rawContent) as GeneratedProject;

    if (!project.files) throw new Error("JSON inválido: sem arquivos.");

    // Wrapper injection
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
    if (e.name === 'AbortError') throw new Error("Tempo limite excedido.");
    console.error("AI Error:", e);
    throw new Error(e.message || "Falha na IA.");
  }
};
