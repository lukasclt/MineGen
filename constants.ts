
import { Platform, JavaVersion, PluginSettings } from './types';

export const DEFAULT_SETTINGS: PluginSettings = {
  name: "MeuPluginIncrivel",
  groupId: "com.exemplo",
  artifactId: "meu-plugin-incrivel",
  version: "1.0-SNAPSHOT",
  platform: Platform.PAPER,
  mcVersion: "1.20.4",
  javaVersion: JavaVersion.JAVA_17,
  description: "Um plugin legal gerado por IA.",
  author: "MineGenAI",
  aiModel: "google/gemini-2.0-flash-001" // Default for OpenRouter
};

export const MC_VERSIONS = [
  "1.21.x", "1.20.6", "1.20.4", "1.20.1", 
  "1.19.4", "1.18.2", "1.17.1", "1.16.5", 
  "1.12.2", "1.8.8"
];

// Prompt Tipo C: Context, Constraints, Content
export const SYSTEM_INSTRUCTION = `
# CONTEXTO
Você é um Engenheiro de Software Sênior especializado em servidores de Minecraft.
Sua missão é gerar código Java impecável para Spigot, Paper, Velocity ou BungeeCord usando Maven.

# PRESERVAÇÃO DE ARQUIVOS (CRÍTICO - REGRA DE OURO)
1. **NUNCA delete ou omita arquivos existentes**: O campo "files" no seu JSON de resposta DEVE conter a lista COMPLETA de todos os arquivos do projeto.
2. Se você estiver alterando apenas uma linha no 'pom.xml', você ainda DEVE incluir todas as classes '.java', arquivos '.yml' e o próprio 'pom.xml' na resposta.
3. Arquivos omitidos da lista serão deletados do workspace do usuário. **NÃO cause perda de dados.**

# RESTRIÇÕES (CONSTRAINTS)
1. **Sistema de Build (Maven)**:
   - Use 'pom.xml' completo e válido.
   - Configure dependências e repositórios corretos para a plataforma escolhida.
   - Configure o 'maven-compiler-plugin' para a versão Java solicitada.

2. **Formato de Resposta**:
   - Responda APENAS com um objeto JSON válido.
   - NÃO use blocos de código Markdown (ex: \`\`\`json).

# ESTRUTURA DO JSON
{
  "explanation": "Explicação curta do que foi feito.",
  "files": [
    {
      "path": "src/main/java/...",
      "content": "conteúdo completo",
      "language": "java"
    }
  ]
}
`;

export const GITHUB_ACTION_TEMPLATE = (targetJavaVersion: string) => {
  const version = targetJavaVersion === '1.8' ? '8' : targetJavaVersion;
  
  return `name: Build Plugin (Maven)

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
    
    - name: Set up JDK ${version}
      uses: actions/setup-java@v4
      with:
        java-version: '${version}'
        distribution: 'temurin'
        cache: 'maven'
    
    - name: Build with Maven
      run: mvn clean package -B
      
    - name: Upload Build Artifact (JAR)
      uses: actions/upload-artifact@v4
      with:
        name: plugin-jar
        path: target/*.jar
`;
};
