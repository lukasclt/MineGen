
export enum Platform {
  SPIGOT = 'Spigot',
  PAPER = 'Paper',
  VELOCITY = 'Velocity',
  BUNGEECORD = 'BungeeCord'
}

export enum JavaVersion {
  JAVA_8 = '1.8',
  JAVA_11 = '11',
  JAVA_16 = '16',
  JAVA_17 = '17',
  JAVA_21 = '21'
}

export enum BuildSystem {
  MAVEN = 'Maven',
  GRADLE = 'Gradle'
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  savedApiKey?: string; // Chave persistida na conta
}

export interface PluginSettings {
  name: string;
  groupId: string;
  artifactId: string;
  version: string;
  platform: Platform;
  mcVersion: string;
  javaVersion: JavaVersion;
  buildSystem: BuildSystem;
  description: string;
  author: string;
  aiModel: string; // Modelo selecionado
  aiUrl: string;
  enableSounds: boolean;
  enableTTS: boolean;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: 'java' | 'xml' | 'yaml' | 'json' | 'text' | 'gradle';
}

export interface GeneratedProject {
  explanation: string;
  files: GeneratedFile[];
}

export interface Attachment {
  type: 'image' | 'text';
  content: string;
  name: string;
}

export interface ChatMessage {
  id?: string;
  threadId?: string; // ID do dono desta conversa (Novo)
  role: 'user' | 'model';
  senderId?: string;
  senderName?: string;
  text: string;
  attachments?: Attachment[];
  projectData?: GeneratedProject; 
  isError?: boolean;
  status?: 'queued' | 'processing' | 'done';
  timestamp?: number; // Adicionado para sincronização de timer
}

export interface SavedProject {
  id: string;
  name: string;
  ownerId: string;
  ownerName?: string; // Adicionado para exibir o nome do dono
  members: string[];
  lastModified: number;
  settings: PluginSettings;
  messages: ChatMessage[];
  generatedProject: GeneratedProject | null;
}

export interface GitHubSettings {
  token: string;
  username: string;
  repoName: string;
}
