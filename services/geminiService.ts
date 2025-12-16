
import OpenAI from 'openai';
import { PluginSettings, GeneratedProject } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Configuration for OpenRouter
const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.API_KEY,
  dangerouslyAllowBrowser: true, // Needed for client-side usage
  defaultHeaders: {
    "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://minegen.ai",
    "X-Title": "MineGen AI",
  }
});

const getModel = (settings?: PluginSettings) => {
  // Return the model string from settings, or default to a Gemini model on OpenRouter
  return settings?.aiModel || "google/gemini-2.0-flash-001";
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

  const systemPrompt = `${SYSTEM_INSTRUCTION}

  IMPORTANTE: Responda estritamente com JSON. Schema:
  {
    "explanation": "string (em português)",
    "files": [ { "path": "string", "content": "string", "language": "string" } ]
  }
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPromptContext }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Sem resposta da IA");
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Generate Error:", error);
    throw new Error(error.message || "Falha ao gerar o código do plugin via OpenRouter.");
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
    
    Response JSON Schema:
    {
      "success": boolean,
      "logs": "string (simulated terminal output)"
    }
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: "Você é um Simulador de Compilador Java/Gradle. Output JSON." },
        { role: "user", content: prompt + "\n\nCÓDIGO PARA VERIFICAR:\n" + fileContext }
      ],
      response_format: { type: "json_object" }
    });
    
    const text = completion.choices[0]?.message?.content;
    if (!text) return { success: false, logs: "Erro: Resposta vazia da IA" };

    return JSON.parse(text) as BuildResult;
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
    
    Responda com JSON estrito combinando com o schema GeneratedProject.
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION + "\nCorrija o código baseado nos logs de erro." },
        { role: "user", content: "CÓDIGO ATUAL:\n" + fileContext + "\n\n" + prompt }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Sem resposta da IA");

    return JSON.parse(text);
  } catch (error: any) {
     throw new Error("Falha ao corrigir código automaticamente: " + error.message);
  }
};
