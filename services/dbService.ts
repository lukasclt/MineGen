
import { User, SavedProject } from "../types";

const STORAGE_URL = (process.env as any).STORAGE_URL;

/**
 * DB Service: Gerencia a persistência remota no MongoDB Atlas / Vercel Storage
 * Utiliza fetch para interagir com a API de dados.
 */
export const dbService = {
  /**
   * Sincroniza um usuário com o banco de dados
   */
  async syncUser(user: User): Promise<User> {
    if (!STORAGE_URL) return user;

    try {
      const response = await fetch(`${STORAGE_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });

      if (!response.ok) throw new Error("Erro ao sincronizar usuário");
      return await response.json();
    } catch (e) {
      console.warn("MongoDB Sync Failed, using local storage fallback", e);
      return user;
    }
  },

  /**
   * Busca um usuário pelo e-mail
   */
  async findUserByEmail(email: string): Promise<User | null> {
    if (!STORAGE_URL) return null;

    try {
      const response = await fetch(`${STORAGE_URL}/users?email=${encodeURIComponent(email)}`);
      if (response.status === 404) return null;
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  },

  /**
   * Salva ou atualiza um projeto na nuvem
   */
  async saveProject(project: SavedProject): Promise<boolean> {
    if (!STORAGE_URL) return false;

    try {
      const response = await fetch(`${STORAGE_URL}/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      return response.ok;
    } catch (e) {
      console.error("Failed to save project to cloud", e);
      return false;
    }
  },

  /**
   * Carrega todos os projetos de um usuário
   */
  async loadUserProjects(userId: string): Promise<SavedProject[]> {
    if (!STORAGE_URL) return [];

    try {
      const response = await fetch(`${STORAGE_URL}/projects?ownerId=${userId}`);
      if (!response.ok) return [];
      return await response.json();
    } catch (e) {
      console.error("Failed to load cloud projects", e);
      return [];
    }
  },

  /**
   * Remove um projeto do banco de dados
   */
  async deleteProject(projectId: string): Promise<boolean> {
    if (!STORAGE_URL) return false;

    try {
      const response = await fetch(`${STORAGE_URL}/projects/${projectId}`, {
        method: 'DELETE'
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }
};
