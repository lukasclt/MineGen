
import { User, SavedProject } from "../types";

// Se API_URL estiver vazia (Vercel Production), usa '/api' automaticamente.
const getApiUrl = () => {
  const envUrl = (process.env as any).API_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/$/, ""); 
  }
  return "/api"; // Caminho relativo padrão para Vercel Serverless
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

// --- MOCK DB LOCAL (Para quando o Backend estiver Offline) ---
const LocalDB = {
  getUsers: (): User[] => JSON.parse(localStorage.getItem('minegen_db_users') || '[]'),
  saveUser: (user: User) => {
    const users = LocalDB.getUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) users[idx] = user;
    else users.push(user);
    localStorage.setItem('minegen_db_users', JSON.stringify(users));
  },
  findUserByEmail: (email: string) => LocalDB.getUsers().find(u => u.email === email),
  
  getProjects: (): SavedProject[] => JSON.parse(localStorage.getItem('minegen_db_projects') || '[]'),
  saveProject: (project: SavedProject) => {
    const projects = LocalDB.getProjects();
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx !== -1) projects[idx] = project;
    else projects.push(project);
    localStorage.setItem('minegen_db_projects', JSON.stringify(projects));
  },
  deleteProject: (id: string) => {
    const projects = LocalDB.getProjects().filter(p => p.id !== id);
    localStorage.setItem('minegen_db_projects', JSON.stringify(projects));
  },
  
  // Convites simples locais
  getInvites: (): Invite[] => JSON.parse(localStorage.getItem('minegen_db_invites') || '[]'),
  saveInvite: (invite: Invite) => {
    const invites = LocalDB.getInvites();
    invites.push(invite);
    localStorage.setItem('minegen_db_invites', JSON.stringify(invites));
  }
};

/**
 * Tenta fazer fetch no backend. Se falhar (Network Error, 404, 50x), executa a função de fallback.
 */
async function tryFetch<T>(
  url: string, 
  options: RequestInit | undefined, 
  fallback: () => Promise<T> | T
): Promise<T> {
  try {
    const response = await fetch(url, options);
    
    // Se o backend responder erro 404 (endpoint não existe) ou 5xx (erro interno/proxy), vai pro fallback
    if (response.status === 404 || response.status >= 500) {
      console.warn(`[Offline Mode] Backend unreachable (${response.status}) for ${url}. Using LocalDB.`);
      return await fallback();
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Erro na requisição.");
    }

    return await response.json();
  } catch (e: any) {
    // Se for erro de rede (fetch failed), vai pro fallback
    if (e.message === 'Failed to fetch' || e.message.includes('NetworkError') || e.message.includes('conexão')) {
       console.warn(`[Offline Mode] Network error for ${url}. Using LocalDB.`);
       return await fallback();
    }
    throw e; // Se for erro de lógica (ex: senha errada retornada pelo backend), lança o erro.
  }
}

export const dbService = {
  
  // --- AUTH ---

  async registerUser(userData: Partial<User>, password?: string): Promise<User> {
    return tryFetch(
      `${API_BASE}/auth/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userData, password })
      },
      () => {
        // Fallback Local
        if (LocalDB.findUserByEmail(userData.email!)) {
           throw new Error("E-mail já cadastrado (Modo Offline).");
        }
        const newUser: User = { 
            id: 'local-' + Math.random().toString(36).substr(2, 9),
            username: userData.username!,
            email: userData.email!,
            githubToken: userData.githubToken!,
            savedApiKey: userData.savedApiKey
        };
        LocalDB.saveUser(newUser);
        return newUser;
      }
    );
  },

  async loginUser(email: string, password?: string): Promise<User> {
    return tryFetch(
      `${API_BASE}/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      },
      () => {
        // Fallback Local (Senha ignorada no mock local para simplicidade, ou poderia salvar hash)
        const user = LocalDB.findUserByEmail(email);
        if (!user) throw new Error("Usuário não encontrado (Modo Offline).");
        return user;
      }
    );
  },

  async updateUser(user: User): Promise<User> {
    return tryFetch(
      `${API_BASE}/users/${user.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      },
      () => {
        LocalDB.saveUser(user);
        return user;
      }
    );
  },

  async deleteUser(userId: string): Promise<boolean> {
    return tryFetch(
      `${API_BASE}/users/${userId}`,
      { method: 'DELETE' },
      () => {
         const users = LocalDB.getUsers().filter(u => u.id !== userId);
         localStorage.setItem('minegen_db_users', JSON.stringify(users));
         return true;
      }
    );
  },

  // --- PROJETOS ---

  async saveProject(project: SavedProject): Promise<boolean> {
    return tryFetch(
      `${API_BASE}/projects/${project.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      },
      () => {
        LocalDB.saveProject(project);
        return true;
      }
    );
  },

  async loadUserProjects(userId: string): Promise<SavedProject[]> {
    return tryFetch(
      `${API_BASE}/projects?ownerId=${userId}`,
      undefined,
      () => {
        // Filtra projetos onde o usuário é dono OU membro
        const user = LocalDB.getUsers().find(u => u.id === userId);
        const email = user ? user.email : '';
        return LocalDB.getProjects().filter(p => p.ownerId === userId || (p.members && email && p.members.includes(email)));
      }
    );
  },

  async deleteProject(projectId: string): Promise<boolean> {
    return tryFetch(
      `${API_BASE}/projects/${projectId}`,
      { method: 'DELETE' },
      () => {
        LocalDB.deleteProject(projectId);
        return true;
      }
    );
  },

  // --- MEMBROS ---

  async removeMember(projectId: string, email: string, requesterId: string): Promise<boolean> {
      return tryFetch(
          `${API_BASE}/projects/${projectId}/members`,
          {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, requesterId })
          },
          () => {
              // Fallback Local
              const projects = LocalDB.getProjects();
              const pIdx = projects.findIndex(p => p.id === projectId);
              if (pIdx === -1) throw new Error("Projeto não encontrado.");

              const project = projects[pIdx];
              // Verifica permissões (Dono pode remover, ou o próprio user)
              const requester = LocalDB.getUsers().find(u => u.id === requesterId);
              if (!requester) throw new Error("Usuário não autenticado.");

              const isOwner = project.ownerId === requesterId;
              const isSelf = requester.email === email;

              if (!isOwner && !isSelf) throw new Error("Permissão negada (Offline).");

              if (project.members) {
                  project.members = project.members.filter(m => m !== email);
                  projects[pIdx] = project;
                  localStorage.setItem('minegen_db_projects', JSON.stringify(projects));
              }
              return true;
          }
      );
  },

  // --- CONVITES ---

  async sendInvite(projectId: string, projectName: string, senderId: string, senderName: string, targetEmail: string): Promise<boolean> {
    return tryFetch(
      `${API_BASE}/invites/send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, projectName, senderId, senderName, targetEmail })
      },
      () => {
        // Fallback Local: Verifica se usuário destino existe localmente
        const target = LocalDB.findUserByEmail(targetEmail);
        if (!target) throw new Error("Usuário não encontrado (Modo Offline - certifique-se que ele se registrou neste navegador).");
        
        const invite: Invite = {
           id: 'inv-' + Math.random().toString(36).substr(2),
           projectId, projectName, senderId, senderName, targetEmail,
           status: 'pending'
        };
        LocalDB.saveInvite(invite);
        return true;
      }
    );
  },

  async createInviteLink(projectId: string, createdBy: string): Promise<string> {
    return tryFetch(
      `${API_BASE}/invites/link`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, createdBy })
      },
      () => {
         // Fallback Link: Usa delimiter :: para não quebrar UUIDs
         const token = `local-link::${projectId}::${Date.now()}`;
         return token;
      }
    );
  },

  async joinProjectByLink(token: string, userEmail: string): Promise<SavedProject> {
    return tryFetch(
      `${API_BASE}/invites/join`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, userEmail })
      },
      () => {
         // Lógica local para link
         if (!token.startsWith('local-link::')) throw new Error("Link inválido ou de ambiente diferente (Online/Offline mismatch).");
         
         const parts = token.split('::');
         const projectId = parts[1]; // local-link::ID::DATE
         
         const projects = LocalDB.getProjects();
         let projectIdx = projects.findIndex(p => p.id === projectId);
         
         // AUTO-REPARO: Se não achou no "DB", procura no cache da UI ('minegen_projects')
         if (projectIdx === -1) {
             try {
                 const uiCache = localStorage.getItem('minegen_projects');
                 if (uiCache) {
                     const uiProjects = JSON.parse(uiCache) as SavedProject[];
                     const cachedProject = uiProjects.find(p => p.id === projectId);
                     if (cachedProject) {
                         LocalDB.saveProject(cachedProject);
                         projects.push(cachedProject); // Atualiza lista local em memória
                         projectIdx = projects.length - 1;
                         console.log("[Offline Mode] Projeto recuperado do cache da UI.");
                     }
                 }
             } catch(e) {
                 console.warn("Falha no auto-reparo do cache UI", e);
             }
         }
         
         if (projectIdx === -1) throw new Error("Projeto não encontrado (Local). O projeto precisa existir neste navegador.");
         
         const project = projects[projectIdx];
         if (!project.members) project.members = [];
         if (!project.members.includes(userEmail)) {
             project.members.push(userEmail);
             projects[projectIdx] = project;
             localStorage.setItem('minegen_db_projects', JSON.stringify(projects));
         }
         return project;
      }
    );
  },

  async checkPendingInvites(userEmail: string): Promise<Invite[]> {
    return tryFetch(
      `${API_BASE}/invites/pending?email=${encodeURIComponent(userEmail)}`,
      undefined,
      () => {
        return LocalDB.getInvites().filter(i => i.targetEmail === userEmail && i.status === 'pending');
      }
    );
  },

  async respondToInvite(inviteId: string, accept: boolean): Promise<SavedProject | null> {
    return tryFetch(
      `${API_BASE}/invites/${inviteId}/respond`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept })
      },
      () => {
        const invites = LocalDB.getInvites();
        const inviteIdx = invites.findIndex(i => i.id === inviteId);
        if (inviteIdx === -1) return null;
        
        const invite = invites[inviteIdx];
        
        // Remove convite
        invites.splice(inviteIdx, 1);
        localStorage.setItem('minegen_db_invites', JSON.stringify(invites));
        
        if (accept) {
           const projects = LocalDB.getProjects();
           const pIdx = projects.findIndex(p => p.id === invite.projectId);
           if (pIdx !== -1) {
              const project = projects[pIdx];
              if (!project.members) project.members = [];
              if (!project.members.includes(invite.targetEmail)) {
                  project.members.push(invite.targetEmail);
                  projects[pIdx] = project;
                  localStorage.setItem('minegen_db_projects', JSON.stringify(projects));
              }
              return project;
           }
        }
        return null;
      }
    );
  }
};
