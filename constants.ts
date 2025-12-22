
import { Platform, JavaVersion, PluginSettings, BuildSystem } from './types';

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Rápido)', provider: 'Google' },
  { id: 'google/gemini-2.0-pro-exp-02-05:free', name: 'Gemini 2.0 Pro (Raciocínio)', provider: 'Google' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'alibaba/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', provider: 'Alibaba' },
  { id: 'deepseek/deepseek-coder', name: 'DeepSeek Coder V2', provider: 'DeepSeek' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'Meta' }
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
  aiModel: 'google/gemini-2.0-flash-001', 
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
