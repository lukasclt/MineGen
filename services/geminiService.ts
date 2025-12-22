
import { PluginSettings, GeneratedProject, Attachment, BuildSystem, User } from "../types";
import { SYSTEM_INSTRUCTION, GRADLEW_UNIX, GRADLEW_BAT, GRADLE_WRAPPER_PROPERTIES } from "../constants";

/**
 * Serviço de integração com OpenRouter (API Unificada)
 */
export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings,
  previousProject?: GeneratedProject | null,
  attachments: Attachment[] = [],
  currentUser?: User | null // Adicionado para pegar a chave da conta
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
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'MineGen AI Cloud',
      },
      body: JSON.stringify({
        model: settings.aiModel || "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: contentArray }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
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
    const rawContent = data.choices[0].message.content;
    
    // Cleanup de possíveis marcações da IA
    const jsonStr = rawContent.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
    const project = JSON.parse(jsonStr) as GeneratedProject;

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
    console.error("AI Generation Error:", e);
    throw new Error(e.message || "Falha na comunicação com OpenRouter.");
  }
};
