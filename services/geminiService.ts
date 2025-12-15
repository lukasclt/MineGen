import { PluginSettings, GeneratedProject } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const getApiKey = () => {
  const apiKey = import.meta.env.VITE_API_KEY || "";
  if (!apiKey) {
    throw new Error("API Key is missing. Please ensure VITE_API_KEY is set in your environment variables.");
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
    if (response.status === 401) throw new Error("Invalid API Key.");
    throw new Error(`OpenRouter API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response content from AI");
  
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
      CONTEXT: The user wants to MODIFY an existing project.
      
      CURRENT PROJECT FILES:
      ${fileContext}
      
      USER REQUEST FOR CHANGES:
      ${prompt}
      
      INSTRUCTIONS:
      1. Analyze the current files.
      2. Apply the requested changes (add new files, modify existing logic, or update configs).
      3. Return the COMPLETE project structure (including unchanged files, so the full project is returned).
    `;
  } else {
    // NEW PROJECT MODE
    userPromptContext = `
      Project Settings:
      - Name: ${settings.name}
      - Platform: ${settings.platform}
      - Minecraft Version: ${settings.mcVersion}
      - Java Version: ${settings.javaVersion}
      - Group ID: ${settings.groupId}
      - Artifact ID: ${settings.artifactId}
      
      User Request: ${prompt}
    `;
  }

  const systemPrompt = `${SYSTEM_INSTRUCTION}

  IMPORTANT: Response strict JSON. Schema:
  {
    "explanation": "string",
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
    throw new Error(error.message || "Failed to generate plugin code.");
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
    Act as a strict Java Compiler and Gradle Build Tool.
    Analyze the following Minecraft Plugin source code for syntax errors, missing imports, logic errors, or invalid configuration.
    
    Simulate running './gradlew clean build'.
    
    If there are NO errors, return success: true.
    If there ARE errors, return success: false and provide a detailed "build log" style error output.
    
    Response JSON Schema:
    {
      "success": boolean,
      "logs": "string (simulated terminal output)"
    }
  `;

  try {
    const result = await callOpenRouter([
      { role: "system", content: "You are a Java/Gradle Compiler Simulator. Output JSON." },
      { role: "user", content: prompt + "\n\nCODE TO CHECK:\n" + fileContext }
    ], model);
    return result as BuildResult;
  } catch (error) {
    return { success: false, logs: "Internal System Error: Could not verify build." };
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
    The previous Gradle build FAILED with the following errors:
    ${buildLogs}
    
    Please FIX the code to resolve these compilation errors.
    Return the FULL updated project structure (including all files, even unchanged ones).
    
    Response strict JSON matching the GeneratedProject schema.
  `;

  try {
    return await callOpenRouter([
      { role: "system", content: SYSTEM_INSTRUCTION + "\nFix the code based on the error logs." },
      { role: "user", content: "CURRENT CODE:\n" + fileContext },
      { role: "user", content: prompt }
    ], model);
  } catch (error: any) {
     throw new Error("Failed to auto-fix code: " + error.message);
  }
};