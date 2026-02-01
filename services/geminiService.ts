
import { PluginSettings, GeneratedProject, Attachment, BuildSystem, User, AIProvider, GeneratedFile, UsageStats } from "../types";
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
): Promise<{ project: GeneratedProject, usage: UsageStats }> => {
  
  const baseUrl = 'https://models.inference.ai.azure.com';
  const apiKey = currentUser?.githubToken || '';
  
  if (!apiKey) throw new Error("Token do GitHub não encontrado. Conecte sua conta.");

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
    const MAX_CONTEXT_CHARS = 9000;
    let currentChars = 0;
    let fileContext = "";
    let skippedCount = 0;

    const sortedFiles = [...previousProject.files].sort((a, b) => {
        const getScore = (f: GeneratedFile) => {
            if (f.path.includes('.github/workflows')) return 200;
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
- Se o usuário pediu para consertar o "Build" ou "Actions", VERIFIQUE SE O ARQUIVO .github/workflows/gradle.yml ESTÁ PRESENTE E CORRETO.
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
      contentArray.push({ type: "image_url", image_url: { url: att.content } });
    } else {
      contentArray.push({ type: "text", text: `\n--- ANEXO: ${att.name} ---\n${att.content}\n` });
    }
  });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: contentArray }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 4000, 
      }),
      signal: signal
    });

    // --- CAPTURA DE USO REAL DO GITHUB ---
    const limit = parseInt(response.headers.get('x-ratelimit-limit-requests') || '50');
    const remaining = parseInt(response.headers.get('x-ratelimit-remaining-requests') || '50');
    const resetEpoch = parseInt(response.headers.get('x-ratelimit-reset-requests') || '0');
    
    const usage: UsageStats = {
      used: limit - remaining,
      limit: limit,
      resetDate: resetEpoch ? new Date(resetEpoch * 1000).toLocaleString('pt-BR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'em breve'
    };

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Erro ${response.status}`;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg = errJson.error?.message || errorMsg;
      } catch {}
      throw new Error(`GitHub Copilot Error: ${errorMsg}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) throw new Error("Resposta vazia da IA.");
    const rawContent = data.choices[0].message.content;
    const project = extractJson(rawContent) as GeneratedProject;

    if (!project.files) throw new Error("JSON inválido: sem arquivos.");

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

    return { project, usage };
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error("Tempo limite excedido.");
    throw new Error(e.message || "Falha na IA.");
  }
};
