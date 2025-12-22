
import { Platform, JavaVersion, PluginSettings, BuildSystem } from './types';

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Recomendado)', provider: 'Google' },
  { id: 'google/gemini-2.0-pro-exp-02-05:free', name: 'Gemini 2.0 Pro (Alta Precisão)', provider: 'Google' },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Raciocínio Lógico)', provider: 'DeepSeek' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B Coder', provider: 'Alibaba' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', provider: 'Mistral' },
  { id: 'microsoft/phi-3-medium-128k-instruct:free', name: 'Phi-3 Medium', provider: 'Microsoft' },
  { id: 'google/learnlm-1.5-pro-experimental:free', name: 'LearnLM 1.5 Pro', provider: 'Google' }
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
