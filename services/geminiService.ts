
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
Você está modificando o projeto "${settings.name}" para a plataforma ${settings.platform} (MC ${settings.mcVersion}, Java ${settings.javaVersion}).

# ESTADO ATUAL DO PROJETO
${fileContext}

# SOLICITAÇÃO DO USUÁRIO
${prompt}

# INSTRUÇÕES TÉCNICAS
1. Mantenha a integridade de todas as classes.
2. Atualize o pom.xml se novas dependências forem necessárias.
3. Garanta que o código siga os padrões da API selecionada.
    `;
  } else {
    userPromptContext = `
# CONTEXTO
Criar um novo projeto de plugin Minecraft do zero.
Nome: ${settings.name}
Plataforma: ${settings.platform}
Versão Java: ${settings.javaVersion}
Versão Minecraft: ${settings.mcVersion}

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

  // Prompt Tipo C: Context, Content, Constraints
  const prompt = `
# CONTEXTO (CONTEXT)
Você é um Engenheiro de Software Sênior em Java e Maven, especializado em debugging de plugins Minecraft (${settings.platform}).
O build do projeto "${settings.name}" falhou na pipeline de CI/CD.

# CONTEÚDO (CONTENT)
1. **Análise**: Examine os logs de erro fornecidos abaixo para identificar a causa raiz (Ex: dependência faltando, erro de sintaxe, versão Java incorreta).
2. **Explicação**: No campo "explanation", descreva tecnicamente o erro encontrado e a solução aplicada (Ex: "A dependência 'bungeecord-chat' não foi encontrada. Adicionei o repositório Sonatype ao pom.xml").
3. **Correção**: Aplique as correções necessárias nos arquivos do projeto para garantir que o build passe.

# RESTRIÇÕES (CONSTRAINTS)
- **Integridade**: Retorne a lista COMPLETA de arquivos em "files". NÃO omita arquivos que não foram alterados.
- **Formato**: A resposta deve ser estritamente um JSON válido.
- **Escopo**: Corrija apenas o necessário para resolver o erro de build.

# LOGS DE ERRO DO MAVEN
${buildLogs}

# CÓDIGO ATUAL DO PROJETO
${fileContext}
  `;

  try {
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION + "\nESTILO: Especialista em Troubleshooting Técnico." },
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
