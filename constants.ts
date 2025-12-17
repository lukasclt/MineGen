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
1. **Sistema de Build (Maven)**:
   - OBRIGATÓRIO usar **Maven**.
   - OBRIGATÓRIO gerar um arquivo 'pom.xml' completo e válido.
   - OBRIGATÓRIO configurar o 'maven-compiler-plugin' com 'source' e 'target' (ou 'release') para a versão Java solicitada.
   - OBRIGATÓRIO usar o 'maven-shade-plugin' para gerenciar dependências e criar o fat-jar (shaded jar).
   - NUNCA gere arquivos de build do Gradle (.gradle).

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
   - Respeite estritamente a versão do Java solicitada:
     - Java 8 (1.8): Sem 'var', sem records, sem switch moderno.
     - Java 11/17/21: Use as funcionalidades disponíveis nessas versões.
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
      "language": "linguagem (java, xml, json, yaml)"
    }
  ]
}
`;

export const GITHUB_ACTION_TEMPLATE = (targetJavaVersion: string) => {
  // A action setup-java espera '8' em vez de '1.8'
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
    
    # Instalamos apenas o JDK selecionado pelo criador
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
