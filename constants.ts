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
Você é um Engenheiro de Software Sênior especializado em ecossistemas de Servidores de Minecraft (Spigot, Paper, Velocity, BungeeCord).
Sua responsabilidade é arquitetar e escrever código Java de alta qualidade, pronto para produção.

# RESTRIÇÕES (CONSTRAINTS)
1. **Sistema de Build (Gradle Moderno)**:
   - OBRIGATÓRIO usar **Gradle** (Groovy DSL).
   - OBRIGATÓRIO gerar 'build.gradle', 'settings.gradle' e 'gradle.properties'.
   - OBRIGATÓRIO usar o plugin 'com.github.johnrengelman.shadow' para gerenciar dependências.
   - **IMPORTANTE: Versão do Java**:
     - Utilize a feature **Java Toolchains** do Gradle para definir a versão do Java.
     - No 'build.gradle', configure:
       \`\`\`groovy
       java {
           toolchain {
               languageVersion = JavaLanguageVersion.of(NUMERO_DA_VERSAO) // ex: 8, 11, 17, 21
           }
       }
       \`\`\`
     - Isso garante que o Gradle consiga compilar para a versão correta de forma isolada.

2. **Padrões de Plataforma**:
   - Para **Paper/Spigot**:
     - Main class deve estender 'JavaPlugin'.
     - Gere arquivo 'src/main/resources/plugin.yml'.
     - Use a dependência 'io.papermc.paper:paper-api' (preferencial) ou 'org.spigotmc:spigot-api'.
   - Para **Velocity**:
     - Main class deve ter anotação '@Plugin'.
     - Use injeção de dependência (@Inject) para Logger e ProxyServer.
     - Gere arquivo 'src/main/resources/velocity-plugin.json'.

3. **Código Java**:
   - Siga as convenções de código Java (camelCase, PascalCase).
   - Se a versão for Java 8, NÃO use 'var', 'records' ou 'switch expressions'.
   - Se a versão for Java 17+, abuse das funcionalidades modernas.
   - Trate exceções e nulls adequadamente.

4. **Formato de Resposta**:
   - A resposta deve ser EXCLUSIVAMENTE um objeto JSON válido.
   - NÃO inclua markdown de bloco de código (\`\`\`json) ao redor da resposta, apenas o JSON cru.

# CONTEÚDO (CONTENT/FORMATO)
Responda com o seguinte esquema JSON:
{
  "explanation": "Breve resumo técnico do que foi feito em Português.",
  "files": [
    {
      "path": "caminho/do/arquivo (ex: src/main/java/com/exemplo/Main.java)",
      "content": "conteúdo completo do arquivo",
      "language": "linguagem (java, json, yaml, groovy)"
    }
  ]
}
`;

export const GITHUB_ACTION_TEMPLATE = (targetJavaVersion: string) => `name: Build Plugin

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
    
    # Instalamos primeiro o JDK alvo do plugin (ex: 8, 11, 17)
    - name: Set up Target JDK (${targetJavaVersion})
      uses: actions/setup-java@v4
      with:
        java-version: '${targetJavaVersion}'
        distribution: 'temurin'
        
    # Instalamos por último o JDK 21 para garantir que ele seja o padrão do ambiente (JAVA_HOME)
    # permitindo que o Gradle 8.5+ rode sem erros de "JVM 17 or later required".
    - name: Set up Runner JDK (21)
      uses: actions/setup-java@v4
      with:
        java-version: '21'
        distribution: 'temurin'
    
    - name: Setup Gradle
      uses: gradle/actions/setup-gradle@v3
      
    - name: Build with Gradle
      # O Gradle usará o Java 21 para rodar e o Toolchain (definido no build.gradle) para compilar.
      run: gradle build --no-daemon
      
    - name: Upload Build Artifact (JAR)
      uses: actions/upload-artifact@v4
      with:
        name: plugin-jar
        path: build/libs/*.jar
`;