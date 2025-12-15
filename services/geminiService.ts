import { GoogleGenAI, Type, Schema } from "@google/genai";
import { PluginSettings, GeneratedProject } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

const apiKey = process.env.API_KEY || ""; 

const ai = new GoogleGenAI({ apiKey });

const fileSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    path: { type: Type.STRING, description: "The full file path (e.g., src/main/resources/plugin.yml)" },
    content: { type: Type.STRING, description: "The full content of the file." },
    language: { 
      type: Type.STRING, 
      enum: ["java", "xml", "yaml", "json", "text"],
      description: "The programming language or file format."
    }
  },
  required: ["path", "content", "language"]
};

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    explanation: { type: Type.STRING, description: "A brief summary of what was changed or created." },
    files: {
      type: Type.ARRAY,
      items: fileSchema,
      description: "List of files generated for the plugin."
    }
  },
  required: ["explanation", "files"]
};

export const generatePluginCode = async (
  prompt: string, 
  settings: PluginSettings
): Promise<GeneratedProject> => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment variables.");
  }

  const modelName = "gemini-3-pro-preview"; // Using Pro for better coding capabilities

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

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: technicalContext,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, // Low temperature for precise code generation
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsed = JSON.parse(text) as GeneratedProject;
    return parsed;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to generate plugin code. Please try again.");
  }
};