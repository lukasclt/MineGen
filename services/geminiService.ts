
import OpenAI from 'openai';
import { PluginSettings, GeneratedProject, Attachment } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.API_KEY,
  dangerouslyAllowBrowser: true,
  defaultHeaders: {
    "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://minegen.ai",
    "X-Title": "MineGen AI",
  }
});

const getModel = (settings?: PluginSettings) => {
  return settings?.aiModel || "google/gemini-2.0-flash-001";
};

const parseJSON = (text: string) => {
  try {
    const cleaned = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("A IA retornou um formato inválido. Tente novamente.");
  }
};

export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings,
  previousProject?: GeneratedProject | null,
  attachments: Attachment[] = []
): Promise<GeneratedProject> => {
  const model = getModel(settings);
  let userPromptContext = "";

  // Instruções adicionais para links e imagens
  const agentCapabilities = `
# CAPACIDADES EXTRAS
1. **Links (Web/YouTube):** Se o usuário enviar links (YouTube, Docs), use seu conhecimento prévio sobre o assunto ou infira o contexto pelo título/descrição fornecida pelo usuário. Se for um tutorial, tente implementar a lógica descrita.
2. **Imagens:** Se o usuário enviou imagens, use-as como referência visual (ex: layouts de GUI, logs de erro, diagramas).
3. **Arquivos de Texto:** Arquivos anexados devem ser tratados como parte do código ou documentação a ser analisada.
  `;

  if (previousProject && previousProject.files.length > 0) {
    const fileContext = previousProject.files.map(f => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n");
    userPromptContext = `
# CONTEXTO
Você está modificando o projeto "${settings.name}" para a plataforma ${settings.platform} (MC ${settings.mcVersion}, Java ${settings.javaVersion}).
Sistema de Build: ${settings.buildSystem}

# ESTADO ATUAL DO PROJETO
${fileContext}

# SOLICITAÇÃO DO USUÁRIO
${prompt}

# INSTRUÇÕES TÉCNICAS
1. Mantenha a integridade de todas as classes.
2. Atualize o arquivo de build (${settings.buildSystem === 'Gradle' ? 'build.gradle' : 'pom.xml'}) se novas dependências forem necessárias.
3. Garanta que o código siga os padrões da API selecionada.
${agentCapabilities}
    `;
  } else {
    userPromptContext = `
# CONTEXTO
Criar um novo projeto de plugin Minecraft do zero.
Nome: ${settings.name}
Plataforma: ${settings.platform}
Versão Java: ${settings.javaVersion}
Versão Minecraft: ${settings.mcVersion}
Sistema de Build: ${settings.buildSystem}

# SOLICITAÇÃO
${prompt}
${agentCapabilities}
    `;
  }

  // Montar payload com anexos
  const contentPayload: any[] = [{ type: "text", text: userPromptContext }];

  for (const att of attachments) {
    if (att.type === 'image') {
      contentPayload.push({
        type: "image_url",
        image_url: {
          url: att.content // Deve ser data:image/... base64
        }
      });
    } else if (att.type === 'text') {
      contentPayload.push({
        type: "text",
        text: `\n--- ANEXO: ${att.name} ---\n${att.content}\n----------------\n`
      });
    }
  }

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: contentPayload }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Sem resposta da IA");
    return parseJSON(text);
  } catch (error: any) {
    throw new Error(error.message || "Erro na geração do plugin.");
  }
};
