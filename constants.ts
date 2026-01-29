
import { Platform, JavaVersion, PluginSettings, BuildSystem, AIProvider } from './types';

export const OPENROUTER_MODELS = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp', provider: 'Google' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen 3 Coder 480B', provider: 'Qwen' },
  { id: 'deepseek/deepseek-r1-distill-llama-70b:free', name: 'DeepSeek R1 Distill 70B', provider: 'DeepSeek' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', provider: 'Meta' }
];

export const GITHUB_COPILOT_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o (GitHub)', provider: 'GitHub' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (GitHub)', provider: 'GitHub' },
  { id: 'Phi-3-medium-4k-instruct', name: 'Phi-3 Medium', provider: 'Microsoft' }
];

export const DEFAULT_SETTINGS: PluginSettings = {
  name: "MeuPlugin",
  groupId: "com.exemplo",
  artifactId: "meu-plugin",
  version: "1.0.0",
  platform: Platform.PAPER,
  mcVersion: "1.20.4",
  javaVersion: JavaVersion.JAVA_17,
  buildSystem: BuildSystem.GRADLE, 
  aiProvider: AIProvider.OPENROUTER, // Padrão inicial
  description: "Plugin gerado via MineGen AI",
  author: "MineGen",
  aiModel: 'google/gemini-2.0-flash-exp:free', 
  aiUrl: 'https://openrouter.ai/api/v1', 
  enableSounds: true,
  enableTTS: false 
};

export const MC_VERSIONS = [
  "1.21.x", "1.20.6", "1.20.4", "1.20.1", 
  "1.19.4", "1.18.2", "1.16.5", "1.8.8"
];

// WORKFLOW DINÂMICO PARA BUILD GRADLE BASEADO NA VERSÃO DO JAVA
export const getGithubWorkflowYml = (javaVersion: string) => {
  // Mapeia "1.8" para "8" para o setup-java action, mas mantem outros como estão
  const actionJavaVersion = javaVersion === '1.8' ? '8' : javaVersion;
  
  return `name: Build Plugin

on:
  push:
    branches: [ "main", "master" ]
  pull_request:
    branches: [ "main", "master" ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4
    
    - name: Set up JDK ${actionJavaVersion}
      uses: actions/setup-java@v4
      with:
        java-version: '${actionJavaVersion}'
        distribution: 'temurin'
        
    - name: Setup Gradle
      uses: gradle/actions/setup-gradle@v3

    - name: Grant execute permission for gradlew
      run: chmod +x gradlew

    - name: Build with Gradle
      run: ./gradlew build

    - name: Upload Artifact
      uses: actions/upload-artifact@v4
      if: success()
      with:
        name: plugin-jar
        path: build/libs/*.jar
`;
};

export const SYSTEM_INSTRUCTION = `
# ROLE & PERSONA
You are a Senior Minecraft Software Architect (Spigot/Paper/Velocity).
Your goal is to generate production-ready code managed via GitHub.

# CRITICAL RULES
1. **Gradle Only**: All projects MUST use Gradle (Groovy DSL or Kotlin DSL).
2. **Java Version**: You MUST configure the 'build.gradle' toolchain/compatibility to match the user's requested Java Version strictly.
3. **GitHub Actions**: Ensure the project works with standard GitHub Actions (./gradlew build).
4. **Commit Messages**: You must provide a concise, semantic commit title and description for the changes you make.

# OUTPUT FORMAT (STRICT JSON)
Structure:
{
  "explanation": "Markdown explanation for the user.",
  "commitTitle": "feat: add user manager class",
  "commitDescription": "Implemented UserHandler with HashMap storage and added event listeners for Join/Quit.",
  "files": [
    {
      "path": "src/main/java/com/example/Main.java",
      "content": "RAW_CODE",
      "language": "java"
    }
  ]
}

# CODING STANDARDS
- Use Modern Java features appropriate for the selected version.
- Use Paper API over Spigot where possible.
- Include 'build.gradle' with 'shadowJar' plugin configured.
- Include 'gradle.properties' if needed.
- NEVER use placeholders like "// Code here". Write full logic.

# ERROR CORRECTION MODE
If provided with BUILD LOGS:
1. Analyze the error stacktrace.
2. Modify ONLY the files causing the error.
3. Explain what was wrong in the "explanation" field.
`;

export const GRADLEW_UNIX = `#!/bin/sh
exec "$JAVACMD" "$@"
`;

export const GRADLEW_BAT = `@rem
%*
`;

export const GRADLE_WRAPPER_PROPERTIES = `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`;
