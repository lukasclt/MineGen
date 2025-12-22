
import { User, SavedProject } from "../types";

const MONGODB_URI = (process.env as any).MONGODB_URI;

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
 * DB Service: Gerencia a persistência remota no MongoDB Atlas
 */
export const dbService = {
  
  // --- AUTH ---

  async registerUser(userData: Partial<User>, password?: string): Promise<User> {
    if (!MONGODB_URI) {
      return { id: Math.random().toString(36).substr(2, 9), ...userData } as User;
    }
    try {
      const response = await fetch(`${MONGODB_URI}/auth/register`, {
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
      throw new Error(e.message || "Erro de conexão ao registrar.");
    }
  },

  async loginUser(email: string, password?: string): Promise<User> {
    if (!MONGODB_URI) throw new Error("Modo offline: Servidor de login não configurado.");
    try {
      const response = await fetch(`${MONGODB_URI}/auth/login`, {
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
      throw new Error(e.message || "Erro de conexão ao logar.");
    }
  },

  async updateUser(user: User): Promise<User> {
    if (!MONGODB_URI) return user;
    try {
      const response = await fetch(`${MONGODB_URI}/users/${user.id}`, {
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
    if (!MONGODB_URI) return true;
    try {
      const response = await fetch(`${MONGODB_URI}/users/${userId}`, { method: 'DELETE' });
      return response.ok;
    } catch (e) { return false; }
  },

  // --- PROJETOS ---

  async saveProject(project: SavedProject): Promise<boolean> {
    if (!MONGODB_URI) return false;
    try {
      const response = await fetch(`${MONGODB_URI}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      return response.ok;
    } catch (e) { return false; }
  },

  async loadUserProjects(userId: string): Promise<SavedProject[]> {
    if (!MONGODB_URI) return [];
    try {
      const response = await fetch(`${MONGODB_URI}/projects?ownerId=${userId}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) { return []; }
  },

  async deleteProject(projectId: string): Promise<boolean> {
    if (!MONGODB_URI) return false;
    try {
      const response = await fetch(`${MONGODB_URI}/projects/${projectId}`, { method: 'DELETE' });
      return response.ok;
    } catch (e) { return false; }
  },

  // --- CONVITES (Novo) ---

  /**
   * Envia um convite. 
   * Retorna erro se o usuário não existir ou não estiver ativo/online.
   */
  async sendInvite(projectId: string, projectName: string, senderId: string, senderName: string, targetEmail: string): Promise<boolean> {
    if (!MONGODB_URI) {
       // Simulação Local
       if (targetEmail.includes('offline')) throw new Error("Usuário não está online.");
       return true;
    }

    try {
      const response = await fetch(`${MONGODB_URI}/invites/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectName, senderId, senderName, targetEmail })
      });

      if (response.status === 404) throw new Error("Usuário não encontrado.");
      if (response.status === 409 || response.status === 410) throw new Error("O usuário não está online ou ativo no momento.");
      if (!response.ok) throw new Error("Falha ao enviar convite.");
      
      return true;
    } catch (e: any) {
      throw e;
    }
  },

  /**
   * Verifica convites pendentes para o usuário logado.
   */
  async checkPendingInvites(userEmail: string): Promise<Invite[]> {
    if (!MONGODB_URI) return [];

    try {
      const response = await fetch(`${MONGODB_URI}/invites/pending?email=${encodeURIComponent(userEmail)}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      return [];
    }
  },

  /**
   * Responde a um convite (Aceitar/Recusar).
   */
  async respondToInvite(inviteId: string, accept: boolean): Promise<SavedProject | null> {
    if (!MONGODB_URI) return null;

    try {
      const response = await fetch(`${MONGODB_URI}/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      });

      if (!response.ok) return null;
      if (accept) {
        // Se aceitou, o backend deve retornar o projeto completo
        return await response.json();
      }
      return null;
    } catch (e) {
      return null;
    }
  }
};
