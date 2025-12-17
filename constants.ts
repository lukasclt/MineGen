
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

# PRESERVAÇÃO DE ARQUIVOS (MUITO IMPORTANTE)
1. **NUNCA delete arquivos**: Ao retornar o JSON, a lista "files" DEVE conter TODOS os arquivos do projeto atual, mesmo os que não foram alterados.
2. Se você omitir um arquivo da lista, ele será DELETADO do workspace do usuário. 
3. Sempre mantenha a estrutura de pastas intacta (src/main/java/..., plugin.yml, pom.xml).

# RESTRIÇÕES (CONSTRAINTS)
1. **Sistema de Build (Maven)**:
   - OBRIGATÓRIO usar **Maven**.
   - OBRIGATÓRIO gerar um arquivo 'pom.xml' completo e válido.
   - Configure o 'maven-compiler-plugin' corretamente para a versão Java.

2. **Padrões de Plataforma**:
   - Paper/Spigot: JavaPlugin, plugin.yml.
   - Velocity: @Plugin, velocity-plugin.json.

3. **Código Java**:
   - Siga as convenções Java (camelCase, PascalCase).
   - Respeite estritamente a versão do Java solicitada.

4. **Formato de Resposta**:
   - A resposta deve ser EXCLUSIVAMENTE um objeto JSON válido.
   - NÃO inclua markdown de bloco de código ao redor da resposta.

# CONTEÚDO (CONTENT/FORMATO)
Responda com o seguinte esquema JSON:
{
  "explanation": "Explicação detalhada em Português do que foi corrigido/adicionado.",
  "files": [
    {
      "path": "caminho/do/arquivo",
      "content": "conteúdo completo",
      "language": "linguagem"
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
