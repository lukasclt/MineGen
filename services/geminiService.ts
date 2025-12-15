import { PluginSettings, GeneratedProject } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const getApiKey = () => {
  const apiKey = import.meta.env.VITE_API_KEY || "";
  if (!apiKey) {
    throw new Error("API Key está faltando. Por favor, verifique se VITE_API_KEY está definida nas variáveis de ambiente.");
  }
  return apiKey;
};

const getModel = (settings?: PluginSettings) => {
  const envModel = import.meta.env.VITE_AI_MODEL || "";
  return settings?.aiModel || envModel || "google/gemini-2.0-flash-001";
};

async function callOpenRouter(messages: any[], model: string) {
  const apiKey = getApiKey();
  
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "MineGen AI",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error("Chave de API inválida.");
    throw new Error(`Erro na API OpenRouter: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Sem resposta da IA");
  
  content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  return JSON.parse(content);
}

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
    return await callOpenRouter([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPromptContext }
    ], model);
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
    
    Response JSON Schema:
    {
      "success": boolean,
      "logs": "string (simulated terminal output)"
    }
  `;

  try {
    const result = await callOpenRouter([
      { role: "system", content: "Você é um Simulador de Compilador Java/Gradle. Output JSON." },
      { role: "user", content: prompt + "\n\nCÓDIGO PARA VERIFICAR:\n" + fileContext }
    ], model);
    return result as BuildResult;
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
    return await callOpenRouter([
      { role: "system", content: SYSTEM_INSTRUCTION + "\nCorrija o código baseado nos logs de erro." },
      { role: "user", content: "CÓDIGO ATUAL:\n" + fileContext },
      { role: "user", content: prompt }
    ], model);
  } catch (error: any) {
     throw new Error("Falha ao corrigir código automaticamente: " + error.message);
  }
};