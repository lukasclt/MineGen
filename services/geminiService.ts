
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
    const fileContext = previousProject.files.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    userPromptContext = `
      CONTEXTO: O usuário quer MODIFICAR um projeto existente.
      
      ARQUIVOS ATUAIS (MANTENHA TODOS ELES NO JSON):
      ${fileContext}
      
      SOLICITAÇÃO:
      ${prompt}
      
      IMPORTANTE: Retorne a lista COMPLETA de arquivos (files). Não omita nenhum arquivo Java ou YML existente.
    `;
  } else {
    userPromptContext = `
      Configurações do Projeto:
      - Nome: ${settings.name}
      - Plataforma: ${settings.platform}
      - Versão do Minecraft: ${settings.mcVersion}
      - Versão do Java: ${settings.javaVersion}
      
      Solicitação do Usuário: ${prompt}
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
    throw new Error(error.message || "Falha ao gerar o código do plugin.");
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
    O build do Maven FALHOU. Corrija os erros mantendo TODO o código restante.
    
    ERROS DO LOG:
    ${buildLogs}
    
    CÓDIGO ATUAL DO PROJETO (VOCÊ DEVE RETORNAR TODOS ESTES ARQUIVOS):
    ${fileContext}
    
    REGRAS DE OURO:
    1. Analise os erros e aplique as correções.
    2. O campo "files" do seu JSON deve conter TODOS os arquivos originais + as correções.
    3. NÃO DELETE AS CLASSES JAVA. Se você retornar apenas o pom.xml, você falhou na tarefa.
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION + "\nFOCO: Correção mantendo integridade total de arquivos." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Sem resposta da IA");

    return parseJSON(text);
  } catch (error: any) {
     throw new Error("Falha ao corrigir código: " + error.message);
  }
};
