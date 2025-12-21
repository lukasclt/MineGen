
import OpenAI from 'openai';
import { PluginSettings, GeneratedProject, Attachment, BuildSystem } from "../types";
import { SYSTEM_INSTRUCTION, GRADLEW_UNIX, GRADLEW_BAT, GRADLE_WRAPPER_PROPERTIES } from "../constants";

// Cache para o cliente para não recriar a cada request se as settings não mudarem
let client: OpenAI | null = null;
let lastBaseUrl: string | null = null;

const getClient = (settings: PluginSettings) => {
    const baseUrl = settings.aiUrl || "https://api.siliconflow.cn/v1"; // Fallback safe
    
    if (!client || lastBaseUrl !== baseUrl) {
        client = new OpenAI({
            baseURL: baseUrl,
            apiKey: process.env.API_KEY,
            dangerouslyAllowBrowser: true,
        });
        lastBaseUrl = baseUrl;
    }
    return client;
};

const getModel = (settings?: PluginSettings) => {
  return settings?.aiModel || "gpt-oss-120b";
};

const parseJSON = (text: string) => {
  try {
    const cleaned = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON. Raw text received:", text);
    throw new Error(`A IA retornou um formato inválido. Log bruto no console.\n\nTrecho: ${text.substring(0, 200)}...`);
  }
};

export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings,
  previousProject?: GeneratedProject | null,
  attachments: Attachment[] = []
): Promise<GeneratedProject> => {
  const model = getModel(settings);
  const apiClient = getClient(settings);

  let userPromptContext = "";

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
  const buildPayload = () => {
    const contentPayload: any[] = [{ type: "text", text: userPromptContext }];

    for (const att of attachments) {
      if (att.type === 'image') {
        contentPayload.push({
          type: "image_url",
          image_url: {
            url: att.content 
          }
        });
      } else if (att.type === 'text') {
        contentPayload.push({
          type: "text",
          text: `\n--- ANEXO: ${att.name} ---\n${att.content}\n----------------\n`
        });
      }
    }
    return contentPayload;
  };

  const executeCall = async (payload: any[]) => {
    let attempts = 0;
    const maxAttempts = 3;
    let currentBackoff = 2000; // Começa com 2 segundos

    while (attempts < maxAttempts) {
      try {
        const completion = await apiClient.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: payload }
          ],
          response_format: { type: "json_object" }
        });

        const text = completion.choices[0]?.message?.content;
        if (!text) throw new Error("Sem resposta da IA");
        return parseJSON(text);

      } catch (error: any) {
        // Log para debug
        console.warn(`Tentativa ${attempts + 1} falhou:`, error.message);

        // Se for erro 429 (Rate Limit) ou erro de servidor temporário (5xx), tenta de novo
        const isRetryable = error.status === 429 || (error.message && error.message.includes('429')) || (error.status >= 500 && error.status < 600);
        
        if (isRetryable) {
          attempts++;
          if (attempts >= maxAttempts) {
             throw new Error("O servidor da IA está muito ocupado (Erro 429/5xx) após várias tentativas. Tente novamente em alguns instantes.");
          }
          
          console.log(`Aguardando ${currentBackoff}ms antes de tentar novamente...`);
          await new Promise(resolve => setTimeout(resolve, currentBackoff));
          currentBackoff *= 2; // Backoff exponencial
          continue;
        }
        
        // Se não for erro de rate limit, lança imediatamente
        throw error;
      }
    }
  };

  try {
    // Envio direto do payload (Multimodal nativo) sem fallback para OCR
    const project = await executeCall(buildPayload());

    // --- PÓS-PROCESSAMENTO: Injeção do Gradle Wrapper ---
    if (settings.buildSystem === BuildSystem.GRADLE) {
        const hasGradlew = project.files.some((f: any) => f.path === 'gradlew' || f.path === 'gradlew.bat');
        
        if (!hasGradlew) {
            // Injetar wrapper padrão para facilitar a vida do usuário
            project.files.push(
                {
                    path: 'gradlew',
                    content: GRADLEW_UNIX,
                    language: 'text'
                },
                {
                    path: 'gradlew.bat',
                    content: GRADLEW_BAT,
                    language: 'text'
                },
                {
                    path: 'gradle/wrapper/gradle-wrapper.properties',
                    content: GRADLE_WRAPPER_PROPERTIES,
                    language: 'text'
                }
            );
        }
    }

    return project;

  } catch (error: any) {
    throw new Error(error.message || "Erro na geração do plugin.");
  }
};
