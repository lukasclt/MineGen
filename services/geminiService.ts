import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PluginSettings, GeneratedProject } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// The API key must be obtained exclusively from the environment variable process.env.API_KEY.
// We assume it is available as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getModel = (settings?: PluginSettings) => {
  const requested = settings?.aiModel;
  // If the user provides a full model name that includes hyphens, use it directly.
  // We filter out legacy 'google/' prefixes from OpenRouter.
  if (requested && !requested.startsWith("google/") && (requested.startsWith("gemini-") || requested.startsWith("veo-"))) {
    return requested;
  }
  // Default for Complex Text Tasks (coding) as per guidelines
  return "gemini-3-pro-preview";
};

// Helper to sanitize JSON string (remove markdown code blocks)
const parseJSON = (text: string) => {
  try {
    // Remove ```json and ``` or just ```
    const cleaned = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON:", text);
    throw new Error("A IA retornou um formato inválido. Tente novamente.");
  }
};

const PROJECT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    explanation: { type: Type.STRING },
    files: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          path: { type: Type.STRING },
          content: { type: Type.STRING },
          language: { type: Type.STRING }
        },
        required: ["path", "content", "language"]
      }
    }
  },
  required: ["explanation", "files"]
};

const BUILD_RESULT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    success: { type: Type.BOOLEAN },
    logs: { type: Type.STRING }
  },
  required: ["success", "logs"]
};

export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings,
  previousProject?: GeneratedProject | null
): Promise<GeneratedProject> => {
  const model = getModel(settings);
  
  let userPromptContext = "";

  if (previousProject && previousProject.files.length > 0) {
    // EDIT MODE: Inject existing files
    const fileContext = previousProject.files.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    userPromptContext = `
      CONTEXTO: O usuário quer MODIFICAR um projeto existente.
      
      ARQUIVOS DO PROJETO ATUAL:
      ${fileContext}
      
      SOLICITAÇÃO DE MUDANÇA DO USUÁRIO:
      ${prompt}
      
      INSTRUÇÕES IMPORTANTES:
      1. Analise os arquivos atuais.
      2. Aplique as mudanças solicitadas (adicionar arquivos, modificar lógica ou atualizar configs).
      3. **VERSÃO AUTOMÁTICA**: Você DEVE incrementar a versão do plugin (ex: 1.0 -> 1.1 ou 1.0-SNAPSHOT -> 1.1-SNAPSHOT) no arquivo 'build.gradle' E no arquivo de configuração do plugin ('plugin.yml' ou 'velocity-plugin.json').
      4. Retorne a estrutura COMPLETA do projeto (incluindo arquivos não alterados, para que o projeto completo seja retornado).
    `;
  } else {
    // NEW PROJECT MODE
    userPromptContext = `
      Configurações do Projeto:
      - Nome: ${settings.name}
      - Plataforma: ${settings.platform}
      - Versão do Minecraft: ${settings.mcVersion}
      - Versão do Java: ${settings.javaVersion}
      - Group ID: ${settings.groupId}
      - Artifact ID: ${settings.artifactId}
      
      Solicitação do Usuário: ${prompt}
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: userPromptContext,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: PROJECT_SCHEMA,
      }
    });

    const text = response.text;
    if (!text) throw new Error("Sem resposta da IA");
    
    return parseJSON(text);
  } catch (error: any) {
    console.error("Generate Error:", error);
    throw new Error(error.message || "Falha ao gerar o código do plugin.");
  }
};

export interface BuildResult {
  success: boolean;
  logs: string;
}

export const simulateGradleBuild = async (
  project: GeneratedProject,
  settings: PluginSettings
): Promise<BuildResult> => {
  const model = getModel(settings);
  
  const fileContext = project.files.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
  
  const prompt = `
    Atue como um Compilador Java e Ferramenta de Build Gradle rigorosos.
    Analise o código fonte do Plugin de Minecraft a seguir em busca de erros de sintaxe, imports faltando, erros de lógica ou configuração inválida.
    
    Simule a execução de './gradlew clean build'.
    
    Se NÃO houver erros, retorne success: true.
    Se HOUVER erros, retorne success: false e forneça um output detalhado estilo "build log" explicando os erros.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt + "\n\nCÓDIGO PARA VERIFICAR:\n" + fileContext,
      config: {
        systemInstruction: "Você é um Simulador de Compilador Java/Gradle.",
        responseMimeType: "application/json",
        responseSchema: BUILD_RESULT_SCHEMA
      }
    });
    
    const text = response.text;
    if (!text) return { success: false, logs: "Erro: Resposta vazia da IA" };

    return parseJSON(text) as BuildResult;
  } catch (error) {
    return { success: false, logs: "Erro Interno do Sistema: Não foi possível verificar o build." };
  }
};

export const fixPluginCode = async (
  project: GeneratedProject,
  buildLogs: string,
  settings: PluginSettings
): Promise<GeneratedProject> => {
  const model = getModel(settings);
  
  const fileContext = project.files.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");

  const prompt = `
    O build anterior do Gradle FALHOU com os seguintes erros:
    ${buildLogs}
    
    Por favor, CORRIJA o código para resolver esses erros de compilação.
    Retorne a estrutura COMPLETA do projeto atualizada (incluindo todos os arquivos, até os não alterados).
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: "CÓDIGO ATUAL:\n" + fileContext + "\n\n" + prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION + "\nCorrija o código baseado nos logs de erro.",
        responseMimeType: "application/json",
        responseSchema: PROJECT_SCHEMA
      }
    });

    const text = response.text;
    if (!text) throw new Error("Sem resposta da IA");

    return parseJSON(text);
  } catch (error: any) {
     throw new Error("Falha ao corrigir código automaticamente: " + error.message);
  }
};