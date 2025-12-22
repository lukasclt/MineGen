
import { Platform, JavaVersion, PluginSettings, BuildSystem } from './types';

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp', provider: 'Google' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen 3 Coder 480B', provider: 'Qwen' },
  { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 (0528)', provider: 'DeepSeek' },
  { id: 'kwaipilot/kat-coder-pro:free', name: 'KAT Coder Pro V1', provider: 'Kwaipilot' },
  { id: 'xiaomi/mimo-v2-flash:free', name: 'Xiaomi MiMo V2', provider: 'Xiaomi' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B', provider: 'Mistral' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B', provider: 'Nous' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'Google' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B', provider: 'NVIDIA' },
  { id: 'allenai/olmo-3.1-32b-think:free', name: 'Olmo 3.1 32B Think', provider: 'AllenAI' },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Dolphin Mistral 24B', provider: 'Venice' },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', provider: 'TNG' },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B', provider: 'OpenAI' }
];

export const DEFAULT_SETTINGS: PluginSettings = {
  name: "MeuPluginIncrivel",
  groupId: "com.exemplo",
  artifactId: "meu-plugin-incrivel",
  version: "1.0-SNAPSHOT",
  platform: Platform.PAPER,
  mcVersion: "1.20.4",
  javaVersion: JavaVersion.JAVA_17,
  buildSystem: BuildSystem.MAVEN,
  description: "Um plugin legal gerado por IA.",
  author: "MineGenAI",
  aiModel: 'google/gemini-2.0-flash-exp:free', 
  aiUrl: 'https://openrouter.ai/api/v1', 
  enableSounds: true,
  enableTTS: true 
};

export const MC_VERSIONS = [
  "1.21.x", "1.20.6", "1.20.4", "1.20.1", 
  "1.19.4", "1.18.2", "1.17.1", "1.16.5", 
  "1.12.2", "1.8.8"
];

// PROMPT TIPO C: Contexto, Restrições, Persona, Formato
export const SYSTEM_INSTRUCTION = `
# ROLE & PERSONA
You are a Senior Minecraft Software Architect specializing in the Spigot, Paper, and Velocity ecosystems.
Your goal is to generate high-performance, maintainable, and production-ready Java code following SOLID principles and Clean Architecture.

# OUTPUT FORMAT (STRICT JSON)
You MUST return ONLY a valid JSON object. Do not include markdown code blocks (like \`\`\`json) wrapping the output if possible, but if you do, ensure the JSON inside is valid.
Structure:
{
  "explanation": "A concise, technical explanation of the implementation decisions (Markdown supported).",
  "files": [
    {
      "path": "src/main/java/com/example/Main.java",
      "content": "RAW_JAVA_CODE",
      "language": "java"
    },
    {
      "path": "src/main/resources/plugin.yml",
      "content": "RAW_YAML_CODE",
      "language": "yaml"
    }
  ]
}

# CODING STANDARDS (Prompt Type C)
1. **Modern Java**: Use features corresponding to the requested Java version (Records for Java 16+, Switch Expressions for Java 14+, var for Java 10+).
2. **API Specifics**:
   - **Paper/Spigot**: Prefer the Paper API over Spigot when available. Use 'Component' (Adventure API) for text instead of legacy '&' codes if version > 1.16.5.
   - **Velocity**: Use the @Plugin annotation and dependency injection structure.
   - **Command Handling**: Implement efficient command executors. For complex plugins, suggest a command framework structure.
3. **Configuration**: Always generate a robust 'config.yml' if values need to be configurable.
4. **Dependency Management**:
   - Always provide the correct 'pom.xml' or 'build.gradle' file with necessary repositories (Papermc, SpigotMC, Sonatype) and dependencies.
   - Ensure the 'maven-shade-plugin' or 'shadowJar' is configured if external libraries are used.
5. **No Placeholders**: Never write "// code here". Implement the full logic requested.

# ERROR HANDLING
- If the user request is ambiguous, make a sensible architectural decision and explain it in the "explanation" field.
- Ensure all imports are correct and unused imports are removed.
`;

export const GRADLE_WRAPPER_PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip
networkTimeout=10000
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;

export const GRADLEW_UNIX = `#!/bin/sh\n# Gradle Wrapper stub\n`;
export const GRADLEW_BAT = `@echo off\nrem Gradle Wrapper stub\n`;
