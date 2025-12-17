
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
    const fileContext = previousProject.files.map(f => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n");
    userPromptContext = `
# CONTEXTO
Usuário deseja modificar o projeto "${settings.name}" (${settings.platform}).

# ESTADO ATUAL DO PROJETO
${fileContext}

# SOLICITAÇÃO DO USUÁRIO
${prompt}

# RESTRIÇÕES
1. Mantenha todos os arquivos no campo "files".
2. Retorne apenas JSON válido.
    `;
  } else {
    userPromptContext = `
# CONTEXTO
Criar um novo plugin Minecraft.
Nome: ${settings.name}
Plataforma: ${settings.platform}
Java: ${settings.javaVersion}
MC: ${settings.mcVersion}

# SOLICITAÇÃO
${prompt}
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
  const fileContext = project.files.map(f => `--- FILE: ${f.path} ---\n${f.content}`).join("\n\n");

  const prompt = `
# CONTEXTO
O build do Maven falhou para o plugin "${settings.name}". Você deve atuar como um engenheiro de software sênior para corrigir o código.

# RESTRIÇÕES (CRÍTICO)
1. **PRESERVAÇÃO TOTAL**: O campo "files" do seu JSON deve conter TODOS os arquivos do projeto. Se você omitir uma classe Java, ela será deletada. MANTENHA TUDO.
2. **COMPATIBILIDADE**: Verifique se as dependências no pom.xml condizem com a versão do Minecraft (${settings.mcVersion}) e Java (${settings.javaVersion}).
3. **RESPOSTA**: Retorne APENAS o JSON com os campos "explanation" e "files".

# CONTEÚDO (LOGS E CÓDIGO)
LOGS DE ERRO DO MAVEN:
${buildLogs}

CÓDIGO ATUAL DO PROJETO:
${fileContext}

# SOLICITAÇÃO
Analise os logs, identifique os erros nos arquivos acima e forneça a versão corrigida de todo o projeto.
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION + "\nESTILO: Engenheiro de Software Sênior em modo de depuração." },
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
