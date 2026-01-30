
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
  { id: 'Phi-3.5-mini-instruct', name: 'Phi-3.5 Mini', provider: 'Microsoft' },
  { id: 'Llama-3.2-90B-Vision-Instruct', name: 'Llama 3.2 90B', provider: 'Meta' }
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
  aiProvider: AIProvider.OPENROUTER, 
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

// WORKFLOW OTIMIZADO: Build + Auto Release
export const getGithubWorkflowYml = (javaVersion: string) => {
  const actionJavaVersion = javaVersion === '1.8' ? '8' : javaVersion;
  
  return `name: Build & Release

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

permissions:
  contents: write # CRÍTICO: Permite criar Releases e Tags

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4
    
    - name: Configurar JDK ${actionJavaVersion}
      uses: actions/setup-java@v4
      with:
        java-version: '${actionJavaVersion}'
        distribution: 'temurin'
        
    - name: Configurar Gradle
      uses: gradle/actions/setup-gradle@v3

    - name: Permissão de Execução Gradlew
      run: chmod +x gradlew

    - name: Compilar com Gradle
      run: ./gradlew build

    - name: Listar Arquivos (Debug)
      run: ls -R build/libs/

    - name: Criar Release Automática
      uses: softprops/action-gh-release@v1
      if: success()
      with:
        tag_name: v1.0.\${{ github.run_number }}
        name: Versão 1.0.\${{ github.run_number }}
        body: |
          Build automático gerado pelo MineGen AI.
          Commit: \${{ github.sha }}
        files: build/libs/*.jar
        draft: false
        prerelease: false
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;
};

export const SYSTEM_INSTRUCTION = `
# PERSONA
Você é um Arquiteto de Software Sênior especializado em Minecraft (Spigot/Paper/Velocity) brasileiro.
Seu objetivo é gerar código Java de produção, gerenciado via Gradle e GitHub.
Você fala EXCLUSIVAMENTE em Português do Brasil (pt-BR).

# REGRAS CRÍTICAS DE BUILD (IMPORTANTE)
Se o usuário reportar problemas de Build, CI/CD ou GitHub Actions, você DEVE VERIFICAR E CRIAR o arquivo \`.github/workflows/gradle.yml\` com o conteúdo abaixo. O GitHub Actions NÃO INICIA se este arquivo não existir ou se faltarem permissões.

TEMPLATE OBRIGATÓRIO PARA \`.github/workflows/gradle.yml\`:
\`\`\`yaml
name: Build & Release
on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up JDK
      uses: actions/setup-java@v4
      with:
        java-version: '17' # ADAPTE ISSO PARA A VERSÃO SOLICITADA
        distribution: 'temurin'
    - name: Setup Gradle
      uses: gradle/actions/setup-gradle@v3
    - name: Grant execute permission for gradlew
      run: chmod +x gradlew
    - name: Build with Gradle
      run: ./gradlew build
    - name: Release Artifacts
      uses: softprops/action-gh-release@v1
      if: success()
      with:
        tag_name: v1.0.\${{ github.run_number }}
        name: Versão 1.0.\${{ github.run_number }}
        files: build/libs/*.jar
        draft: false
        prerelease: false
      env:
        GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
\`\`\`

# REGRAS GERAIS
1. **Gradle Obrigatório**: Use Gradle (Groovy/Kotlin).
2. **Versão Java**: Configure 'build.gradle' (toolchain) para a versão correta.
3. **Comentários**: Escreva Javadoc e comentários em Português.
4. **Respostas**: Sempre explique o que foi feito em Português.

# FORMATO DE SAÍDA (JSON ESTRITO)
Estrutura:
{
  "explanation": "Explicação em Markdown (PT-BR).",
  "commitTitle": "fix: corrigir build",
  "commitDescription": "Adicionado workflow de build e release.",
  "files": [
    {
      "path": ".github/workflows/gradle.yml",
      "content": "CONTEUDO_DO_YAML",
      "language": "yaml"
    }
  ]
}
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
