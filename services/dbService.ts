
import { User, SavedProject } from "../types";

// Lógica de URL Inteligente:
// 1. Se houver variável de ambiente API_URL, usa ela (ex: http://localhost:3000 para dev local)
// 2. Se não, assume que estamos no Vercel e o backend está na mesma origem, sob a rota /api
const getApiUrl = () => {
  const envUrl = (process.env as any).API_URL;
  if (envUrl) return envUrl.replace(/\/$/, ""); // Remove barra final se houver
  return "/api"; // Modo Relativo (Produção Vercel)
};

const API_BASE = getApiUrl();

export interface Invite {
  id: string;
  projectId: string;
  projectName: string;
  senderId: string;
  senderName: string;
  targetEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
}

/**
 * DB Service: Agora usa Vercel Blob via API Serverless
 */
export const dbService = {
  
  // --- AUTH ---

  async registerUser(userData: Partial<User>, password?: string): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...userData, password })
    });
    if (!response.ok) throw new Error((await response.json()).message || "Erro ao registrar");
    return await response.json();
  },

  async loginUser(email: string, password?: string): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error((await response.json()).message || "Erro ao logar");
    return await response.json();
  },

  async updateUser(user: User): Promise<User> {
    const response = await fetch(`${API_BASE}/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (!response.ok) throw new Error("Falha ao atualizar");
    return await response.json();
  },

  async deleteUser(userId: string): Promise<boolean> {
    const response = await fetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' });
    return response.ok;
  },

  // --- PROJETOS ---

  async saveProject(project: SavedProject): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      return response.ok;
    } catch (e) { return false; }
  },

  async loadUserProjects(userId: string): Promise<SavedProject[]> {
    try {
      const response = await fetch(`${API_BASE}/projects?ownerId=${userId}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) { return []; }
  },

  async deleteProject(projectId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}`, { method: 'DELETE' });
      return response.ok;
    } catch (e) { return false; }
  },

  // --- CONVITES ---

  async sendInvite(projectId: string, projectName: string, senderId: string, senderName: string, targetEmail: string): Promise<boolean> {
    const response = await fetch(`${API_BASE}/invites/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, projectName, senderId, senderName, targetEmail })
    });

    if (response.status === 404) throw new Error("Usuário não encontrado.");
    if (response.status === 409) throw new Error("Usuário offline.");
    if (!response.ok) throw new Error("Erro ao enviar convite.");
    
    return true;
  },

  async checkPendingInvites(userEmail: string): Promise<Invite[]> {
    try {
      const response = await fetch(`${API_BASE}/invites/pending?email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) { return []; }
  },

  async respondToInvite(inviteId: string, accept: boolean): Promise<SavedProject | null> {
    try {
      const response = await fetch(`${API_BASE}/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      });
      if (!response.ok) return null;
      if (accept) return await response.json();
      return null;
    } catch (e) { return null; }
  }
};
