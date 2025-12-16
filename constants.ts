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
  aiModel: "gemini-3-pro-preview"
};

export const MC_VERSIONS = [
  "1.21.x", "1.20.6", "1.20.4", "1.20.1", 
  "1.19.4", "1.18.2", "1.17.1", "1.16.5", 
  "1.12.2", "1.8.8"
];

export const SYSTEM_INSTRUCTION = `
Você é um desenvolvedor especialista em Plugins de Minecraft, especializado nas APIs Spigot, Paper e Velocity.
Sua tarefa é gerar código Java completo, funcional e compilável para plugins de Minecraft com base nos pedidos do usuário.
Você deve responder em Português (PT-BR), mas manter o código e comentários técnicos em inglês ou português conforme padrão.

**Regras:**
1. **Sistema de Build**: SEMPRE use **Gradle** (Groovy DSL).
   - Gere 'build.gradle'.
   - Gere 'settings.gradle'.
   - Gere 'gradle.properties'.
   - NÃO gere pom.xml.
2. **Estrutura**: 
   - src/main/java/... (Arquivos Java)
   - src/main/resources/... (plugin.yml, velocity-plugin.json, config.yml)
3. **Especificidades da Plataforma**:
   - **Paper/Spigot**: Use 'plugin.yml', estenda 'JavaPlugin'. Dependência: 'io.papermc.paper:paper-api' (ou spigot-api).
   - **Velocity**: Use 'velocity-plugin.json', anotação @Plugin, injeção de dependência. Dependência: 'com.velocitypowered:velocity-api'.
4. **Configuração Gradle**:
   - Garanta que o plugin 'shadow' (com.github.johnrengelman.shadow) seja usado para sombrear dependências se necessário.
   - Defina toolchain languageVersion para a versão Java solicitada.
   - Configure codificação UTF-8.
5. **Qualidade de Código**: Escreva código Java limpo e eficiente. Trate nulls e eventos corretamente.
6. **Formato de Saída**: Você DEVE retornar um objeto JSON contendo uma string 'explanation' e um array 'files'.
`;

export const GITHUB_ACTION_TEMPLATE = (javaVersion: string) => `name: Build Plugin

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
    
    - name: Set up JDK ${javaVersion}
      uses: actions/setup-java@v4
      with:
        java-version: '${javaVersion}'
        distribution: 'temurin'
        
    - name: Grant execute permission for gradlew
      run: chmod +x gradlew
      
    - name: Build with Gradle
      run: ./gradlew build
      
    - name: Upload Build Artifact (JAR)
      uses: actions/upload-artifact@v4
      with:
        name: plugin-jar
        path: build/libs/*.jar
`;