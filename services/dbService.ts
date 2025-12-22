
import { User, SavedProject } from "../types";

// O frontend fala com o backend.js rodando localmente
const API_URL = (process.env as any).API_URL || "http://localhost:3000";

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
 * DB Service: Cliente HTTP para backend.js
 */
export const dbService = {
  
  // --- AUTH ---

  async registerUser(userData: Partial<User>, password?: string): Promise<User> {
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, password })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Erro ${response.status}: Falha ao registrar.`);
      }
      return await response.json();
    } catch (e: any) {
      if (e.message.includes('Failed to fetch')) {
         throw new Error("Backend Offline. Rode 'npm run server' no terminal.");
      }
      throw new Error(e.message || "Erro de conexão ao registrar.");
    }
  },

  async loginUser(email: string, password?: string): Promise<User> {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "E-mail ou senha incorretos.");
      }
      return await response.json();
    } catch (e: any) {
      if (e.message.includes('Failed to fetch')) throw new Error("Backend Offline. Rode 'npm run server'.");
      throw new Error(e.message || "Erro de conexão ao logar.");
    }
  },

  async updateUser(user: User): Promise<User> {
    try {
      const response = await fetch(`${API_URL}/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (!response.ok) throw new Error("Falha ao atualizar perfil.");
      return await response.json();
    } catch (e) {
      return user;
    }
  },

  async deleteUser(userId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
      return response.ok;
    } catch (e) { return false; }
  },

  // --- PROJETOS ---

  async saveProject(project: SavedProject): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      return response.ok;
    } catch (e) { 
      console.error("Save Error:", e);
      return false; 
    }
  },

  async loadUserProjects(userId: string): Promise<SavedProject[]> {
    try {
      const response = await fetch(`${API_URL}/projects?ownerId=${userId}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) { return []; }
  },

  async deleteProject(projectId: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/projects/${projectId}`, { method: 'DELETE' });
      return response.ok;
    } catch (e) { return false; }
  },

  // --- CONVITES ---

  async sendInvite(projectId: string, projectName: string, senderId: string, senderName: string, targetEmail: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/invites/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectName, senderId, senderName, targetEmail })
      });

      if (response.status === 404) throw new Error("Usuário não encontrado.");
      if (response.status === 409) throw new Error("O usuário não está online no momento.");
      if (!response.ok) throw new Error("Falha ao enviar convite.");
      
      return true;
    } catch (e: any) {
      throw e;
    }
  },

  async checkPendingInvites(userEmail: string): Promise<Invite[]> {
    try {
      const response = await fetch(`${API_URL}/invites/pending?email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      return [];
    }
  },

  async respondToInvite(inviteId: string, accept: boolean): Promise<SavedProject | null> {
    try {
      const response = await fetch(`${API_URL}/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      });

      if (!response.ok) return null;
      if (accept) {
        return await response.json();
      }
      return null;
    } catch (e) {
      return null;
    }
  }
};
