import { PluginSettings, GeneratedProject } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings
): Promise<GeneratedProject> => {
  // Access environment variables using Vite's import.meta.env
  // On Vercel, ensure your Environment Variables are prefixed with VITE_ (e.g., VITE_API_KEY)
  const envApiKey = import.meta.env.VITE_API_KEY || "";
  const envModel = import.meta.env.VITE_AI_MODEL || "";

  // Prioritize settings (user input), then env, then empty
  const apiKey = settings.apiKey || envApiKey || ""; 
  const model = settings.aiModel || envModel || "";

  if (!apiKey) {
    throw new Error("API Key is missing. Please enter your OpenRouter API Key in the settings sidebar.");
  }

  const technicalContext = `
    Project Settings:
    - Name: ${settings.name}
    - Platform: ${settings.platform}
    - Minecraft Version: ${settings.mcVersion}
    - Java Version: ${settings.javaVersion}
    - Group ID: ${settings.groupId}
    - Artifact ID: ${settings.artifactId}
    
    User Request: ${prompt}
  `;

  // Enhanced system prompt to ensure JSON response via OpenRouter models
  const systemPrompt = `${SYSTEM_INSTRUCTION}

  IMPORTANT: You must response strictly in valid JSON format. 
  Do not include markdown formatting like \`\`\`json. 
  Just return the raw JSON object matching the schema:
  {
    "explanation": "A brief summary of what was changed or created.",
    "files": [
      {
        "path": "path/to/file.ext",
        "content": "file content...",
        "language": "java|xml|yaml|json|text"
      }
    ]
  }
  `;

  try {
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: technicalContext }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" } // Hints to compatible models to output JSON
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Check for common 401/403 errors to give better feedback
      if (response.status === 401) {
          throw new Error("Invalid API Key. Please check the key in Settings.");
      }
      throw new Error(`OpenRouter API Error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error("No response content from AI");

    // Clean up potential markdown code blocks if the model ignores the instruction
    content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");

    try {
        const parsed = JSON.parse(content) as GeneratedProject;
        return parsed;
    } catch (parseError) {
        console.error("Failed to parse JSON:", content);
        throw new Error("AI response was not valid JSON. Please try again.");
    }

  } catch (error: any) {
    console.error("OpenRouter Service Error:", error);
    throw new Error(error.message || "Failed to generate plugin code.");
  }
};