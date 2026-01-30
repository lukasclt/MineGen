
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
  GRADLE = 'Gradle',
  MAVEN = 'Maven'
}

export enum AIProvider {
  OPENROUTER = 'OpenRouter',
  GITHUB_COPILOT = 'GitHub Copilot'
}

export interface User {
  id: string; // GitHub Login
  username: string;
  avatarUrl?: string;
  githubToken: string; // Token PAT
  email?: string;
  savedApiKey?: string;
}

export interface UsageStats {
  used: number;
  limit: number;
  resetDate: string;
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
  aiProvider: AIProvider; // Novo campo
  description: string;
  author: string;
  aiModel: string;
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
  commitTitle: string; 
  commitDescription: string; 
  files: GeneratedFile[];
}

export interface Attachment {
  type: 'image' | 'text';
  content: string;
  name: string;
}

export interface ChatMessage {
  id?: string;
  threadId?: string;
  role: 'user' | 'model';
  senderId?: string;
  senderName?: string;
  text: string;
  attachments?: Attachment[];
  projectData?: GeneratedProject; 
  isError?: boolean;
  status?: 'queued' | 'processing' | 'done';
  timestamp?: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  default_branch: string;
  updated_at: string;
}

export interface ProjectState {
  repo: GitHubRepo;
  settings: PluginSettings;
  messages: ChatMessage[];
  files: GeneratedFile[];
  lastBuildStatus?: 'success' | 'failure' | 'pending' | null;
  currentActionRunId?: number;
}

export interface SavedProject {
  id: string;
  ownerId?: string;
  name?: string;
  members?: string[];
  lastModified?: number;
  files?: GeneratedFile[];
  settings?: PluginSettings;
}
