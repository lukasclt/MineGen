
import { Platform, JavaVersion, PluginSettings, BuildSystem } from './types';

export const OPENROUTER_MODELS = [
  { id: 'xiaomi/mimo-v2-flash:free', name: 'Xiaomi MiMo V2 Flash', provider: 'Xiaomi' },
  { id: 'mistralai/devstral-2512:free', name: 'Mistral Devstral 2', provider: 'Mistral' },
  { id: 'kwaipilot/kat-coder-pro:free', name: 'Kwaipilot KAT Coder Pro', provider: 'Kwaipilot' },
  { id: 'tngtech/deepseek-r1t2-chimera:free', name: 'DeepSeek R1T2 Chimera', provider: 'TNG' },
  { id: 'nex-agi/deepseek-v3.1-nex-n1:free', name: 'DeepSeek V3.1 Nex N1', provider: 'Nex AGI' },
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', name: 'Nemotron Nano 12B V2 VL', provider: 'NVIDIA' },
  { id: 'tngtech/deepseek-r1t-chimera:free', name: 'DeepSeek R1T Chimera', provider: 'TNG' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free', name: 'Nemotron 3 Nano 30B', provider: 'NVIDIA' },
  { id: 'z-ai/glm-4.5-air:free', name: 'GLM 4.5 Air', provider: 'Z.AI' },
  { id: 'tngtech/tng-r1t-chimera:free', name: 'R1T Chimera', provider: 'TNG' },
  { id: 'allenai/olmo-3.1-32b-think:free', name: 'Olmo 3.1 32B Think', provider: 'AllenAI' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen3 Coder 480B', provider: 'Qwen' },
  { id: 'openai/gpt-oss-20b:free', name: 'GPT OSS 20B', provider: 'OpenAI' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'Google' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'deepseek/deepseek-r1-0528:free', name: 'DeepSeek R1 0528', provider: 'DeepSeek' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp', provider: 'Google' },
  { id: 'alibaba/tongyi-deepresearch-30b-a3b:free', name: 'Tongyi DeepResearch 30B', provider: 'Alibaba' },
  { id: 'allenai/olmo-3-32b-think:free', name: 'Olmo 3 32B Think', provider: 'AllenAI' },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS 120B', provider: 'OpenAI' },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Dolphin Mistral 24B (Uncensored)', provider: 'Venice' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct', provider: 'Mistral' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 405B', provider: 'Nous' },
  { id: 'nvidia/nemotron-nano-9b-v2:free', name: 'Nemotron Nano 9B V2', provider: 'NVIDIA' },
  { id: 'arcee-ai/trinity-mini:free', name: 'Trinity Mini', provider: 'Arcee AI' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B', provider: 'Mistral' },
  { id: 'meta-llama/llama-3.1-405b-instruct:free', name: 'Llama 3.1 405B', provider: 'Meta' },
  { id: 'qwen/qwen-2.5-vl-7b-instruct:free', name: 'Qwen 2.5 VL 7B', provider: 'Qwen' },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B', provider: 'Meta' },
  { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2', provider: 'MoonshotAI' },
  { id: 'qwen/qwen3-4b:free', name: 'Qwen3 4B', provider: 'Qwen' },
  { id: 'google/gemma-3-12b-it:free', name: 'Gemma 3 12B', provider: 'Google' },
  { id: 'google/gemma-3n-e4b-it:free', name: 'Gemma 3n 4B', provider: 'Google' },
  { id: 'google/gemma-3n-e2b-it:free', name: 'Gemma 3n 2B', provider: 'Google' },
  { id: 'google/gemma-3-4b-it:free', name: 'Gemma 3 4B', provider: 'Google' }
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

export const SYSTEM_INSTRUCTION = `
# CONTEXTO
Você é um Arquiteto de Software Sênior especializado no ecossistema Minecraft (Spigot, Paper, Velocity).
Sua missão é gerar código Java de alta qualidade, seguindo as melhores práticas (SOLID, DRY).

# REGRAS DE RESPOSTA (JSON OBRIGATÓRIO)
Retorne APENAS um objeto JSON com esta estrutura:
{
  "explanation": "Breve explicação do que foi feito",
  "files": [
    {
      "path": "src/main/java/com/exemplo/Classe.java",
      "content": "CONTEÚDO_COMPLETO_AQUI",
      "language": "java|xml|yaml|gradle"
    }
  ]
}

# CONSTRAINTS
- NUNCA use placeholders. Retorne o arquivo INTEGRAL.
- Se for Paper, use a Paper API preferencialmente à Spigot.
- Garanta que o plugin.yml ou paper-plugin.yml esteja correto.
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
