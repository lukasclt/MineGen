
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

export interface PluginSettings {
  name: string;
  groupId: string;
  artifactId: string;
  version: string;
  platform: Platform;
  mcVersion: string;
  javaVersion: JavaVersion;
  description: string;
  author: string;
  aiModel?: string;
}

export interface GitHubSettings {
  token: string;
  username: string;
  repoName: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
  language: 'java' | 'xml' | 'yaml' | 'json' | 'text';
}

export interface GeneratedProject {
  explanation: string;
  files: GeneratedFile[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  projectData?: GeneratedProject; // Only model messages might have this
  isError?: boolean;
}

export interface SavedProject {
  id: string;
  name: string;
  lastModified: number;
  settings: PluginSettings;
  messages: ChatMessage[];
  generatedProject: GeneratedProject | null;
}
