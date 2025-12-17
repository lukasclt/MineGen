
import OpenAI from 'openai';
import { PluginSettings, GeneratedProject } from "../types";
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
  previousProject?: GeneratedProject | null
): Promise<GeneratedProject> => {
  const model = getModel(settings);
  let userPromptContext = "";

  if (previousProject && previousProject.files.length > 0) {
    const fileContext = previousProject.files.map(f => `--- ARQUIVO: ${f.path} ---\n${f.content}`).join("\n\n");
    userPromptContext = `
      ESTADO ATUAL DO PROJETO:
      ${fileContext}
      
      MUDANÇA SOLICITADA:
      ${prompt}
      
      IMPORTANTE: Retorne a lista COMPLETA de arquivos no JSON, incluindo os que não mudaram.
    `;
  } else {
    userPromptContext = `
      Novo Projeto Minecraft:
      - Nome: ${settings.name}
      - Plataforma: ${settings.platform}
      - Java: ${settings.javaVersion}
      - Minecraft: ${settings.mcVersion}
      
      Solicitação: ${prompt}
    `;
  }

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: userPromptContext }
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

export const fixPluginCode = async (
  project: GeneratedProject,
  buildLogs: string,
  settings: PluginSettings
): Promise<GeneratedProject> => {
  const model = getModel(settings);
  const fileContext = project.files.map(f => `--- ARQUIVO: ${f.path} ---\n${f.content}`).join("\n\n");

  const prompt = `
    ERRO DE COMPILAÇÃO MAVEN DETECTADO.
    
    LOGS DE ERRO:
    ${buildLogs}
    
    CÓDIGO ATUAL DO PROJETO:
    ${fileContext}
    
    TAREFA:
    1. Analise os logs e corrija os arquivos necessários.
    2. RETORNE TODOS OS ARQUIVOS DO PROJETO NO JSON FINAL. Não remova as classes Java. Se você retornar apenas o pom.xml, você causará a perda de todo o código do usuário. MANTENHA TUDO.
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION + "\nFOCO: Reparo de erros sem perda de arquivos." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Sem resposta da IA");
    return parseJSON(text);
  } catch (error: any) {
     throw new Error("Falha no Auto-Fix: " + error.message);
  }
};
