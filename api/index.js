
import express from 'express';
import cors from 'cors';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const router = express.Router();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

// --- Camada de Dados (Redis com Fallback em Memória) ---

const memoryStore = new Map();
let useRedis = false;
let client = null;

// Inicialização do Redis
(async () => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      console.log("🔄 Tentando conectar ao Redis...");
      
      // Configuração para suportar TLS se a URL for rediss://
      const socketOptions = redisUrl.startsWith('rediss://') 
        ? { tls: true, rejectUnauthorized: false } 
        : {};

      client = createClient({
        url: redisUrl,
        socket: socketOptions
      });

      client.on('error', (err) => {
        // Log discreto para erros de conexão recorrentes
        if (useRedis) console.error('🔴 Redis Client Error:', err.message);
      });

      await client.connect();
      useRedis = true;
      console.log("✅ Conectado ao Redis com sucesso!");
    } catch (e) {
      console.warn("⚠️  Falha na conexão inicial com Redis:", e.message);
      console.warn("⚠️  O sistema rodará em memória (dados voláteis). Verifique REDIS_URL.");
      useRedis = false;
    }
  } else {
    console.log("ℹ️  REDIS_URL não definida. Usando armazenamento em memória.");
  }
})();

// Abstração do Banco de Dados para suportar Redis ou Memória transparentemente
const db = {
    async get(key) {
        if (useRedis && client?.isOpen) {
            try { return await client.get(key); } 
            catch (e) { return memoryStore.get(key) || null; }
        }
        return memoryStore.get(key) || null;
    },
    async set(key, value) {
        if (useRedis && client?.isOpen) {
            try { return await client.set(key, value); }
            catch (e) { memoryStore.set(key, value); return 'OK'; }
        }
        memoryStore.set(key, value);
        return 'OK';
    },
    async setEx(key, seconds, value) {
        if (useRedis && client?.isOpen) {
            try { return await client.setEx(key, seconds, value); }
            catch (e) { 
                memoryStore.set(key, value);
                setTimeout(() => memoryStore.delete(key), seconds * 1000);
                return 'OK'; 
            }
        }
        memoryStore.set(key, value);
        setTimeout(() => memoryStore.delete(key), seconds * 1000);
        return 'OK';
    },
    async del(key) {
        if (useRedis && client?.isOpen) {
            try { return await client.del(key); }
            catch (e) { return memoryStore.delete(key) ? 1 : 0; }
        }
        return memoryStore.delete(key) ? 1 : 0;
    },
    async keys(pattern) {
        if (useRedis && client?.isOpen) {
            try { return await client.keys(pattern); }
            catch (e) { /* Fallback to regex below */ }
        }
        
        // Converte padrão Redis simples (minegen:project:*) para Regex de forma segura
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
        const regex = new RegExp(regexStr);
        
        return Array.from(memoryStore.keys()).filter(k => regex.test(k));
    },
    async mGet(keys) {
        if (keys.length === 0) return [];
        if (useRedis && client?.isOpen) {
            try { return await client.mGet(keys); }
            catch (e) { return keys.map(k => memoryStore.get(k) || null); }
        }
        return keys.map(k => memoryStore.get(k) || null);
    },
    async exists(key) {
        if (useRedis && client?.isOpen) {
             try { return await client.exists(key); }
             catch (e) { return memoryStore.has(key) ? 1 : 0; }
        }
        return memoryStore.has(key) ? 1 : 0;
    }
};

// Helper Functions
const getKey = (type, id) => `minegen:${type}:${id}`;

// --- AUTH ---

router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password, savedApiKey } = req.body;

    const emailKey = getKey('email_map', email);
    const existingId = await db.get(emailKey);

    if (existingId) {
      return res.status(400).json({ message: 'E-mail já cadastrado.' });
    }

    const userId = Math.random().toString(36).substr(2, 9);
    const newUser = {
      id: userId,
      username,
      email,
      password,
      savedApiKey,
      lastSeen: Date.now()
    };

    await db.set(getKey('user', userId), JSON.stringify(newUser));
    await db.set(emailKey, userId);

    const { password: _, ...userWithoutPass } = newUser;
    res.json(userWithoutPass);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Erro interno ao registrar usuário.' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const userId = await db.get(getKey('email_map', email));
    if (!userId) return res.status(401).json({ message: 'Credenciais inválidas.' });

    const userJson = await db.get(getKey('user', userId));
    if (!userJson) return res.status(404).json({ message: 'Usuário não encontrado.' });

    const user = JSON.parse(userJson);
    if (user.password !== password) return res.status(401).json({ message: 'Credenciais inválidas.' });

    user.lastSeen = Date.now();
    await db.set(getKey('user', userId), JSON.stringify(user));

    const { password: _, ...userWithoutPass } = user;
    res.json(userWithoutPass);
  } catch (e) {
    res.status(500).json({ message: 'Erro no login.' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const userJson = await db.get(getKey('user', id));
    if (!userJson) return res.status(404).json({ message: 'User not found' });

    const user = JSON.parse(userJson);
    const updatedUser = { ...user, ...updates };
    if (!updates.password) updatedUser.password = user.password;

    await db.set(getKey('user', id), JSON.stringify(updatedUser));
    
    const { password: _, ...clean } = updatedUser;
    res.json(clean);
  } catch (e) { res.status(500).json({ message: 'Erro ao atualizar.' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userJson = await db.get(getKey('user', id));
    if (userJson) {
        const user = JSON.parse(userJson);
        await db.del(getKey('email_map', user.email));
    }
    await db.del(getKey('user', id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar.' }); }
});

// --- PROJETOS ---

router.get('/projects', async (req, res) => {
  try {
    const { ownerId } = req.query;
    if (!ownerId) return res.json([]);

    const userJson = await db.get(getKey('user', ownerId));
    if (!userJson) return res.json([]);
    const userEmail = JSON.parse(userJson).email;

    // Busca chaves
    const keys = await db.keys('minegen:project:*');
    if (keys.length === 0) return res.json([]);

    // Busca valores
    const projectsJson = await db.mGet(keys);
    
    // Filtra e parseia
    const projects = projectsJson
        .map(p => p ? JSON.parse(p) : null)
        .filter(p => p && (p.ownerId === ownerId || (p.members && p.members.includes(userEmail))));

    res.json(projects);
  } catch (e) { 
    console.error(e);
    res.status(500).json({ message: 'Erro ao listar projetos.' }); 
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectData = req.body;
    
    projectData.lastModified = Date.now();

    await db.set(getKey('project', id), JSON.stringify(projectData));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao salvar projeto.' }); }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.del(getKey('project', id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar projeto.' }); }
});

// --- MEMBROS ---

router.delete('/projects/:id/members', async (req, res) => {
    try {
        const { id } = req.params;
        const { email, requesterId } = req.body;

        const projectKey = getKey('project', id);
        const projectJson = await db.get(projectKey);
        if (!projectJson) return res.status(404).json({ message: 'Projeto não encontrado.' });
        
        const project = JSON.parse(projectJson);
        
        // Verifica permissão (Dono pode remover qualquer um, Membro pode remover a si mesmo)
        const requesterJson = await db.get(getKey('user', requesterId));
        if (!requesterJson) return res.status(403).json({ message: 'Acesso negado.' });
        const requester = JSON.parse(requesterJson);

        const isOwner = project.ownerId === requesterId;
        const isSelf = requester.email === email;

        if (!isOwner && !isSelf) {
            return res.status(403).json({ message: 'Você não tem permissão para remover este membro.' });
        }

        if (project.members) {
            project.members = project.members.filter(m => m !== email);
            project.lastModified = Date.now();
            await db.set(projectKey, JSON.stringify(project));
        }

        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Erro ao remover membro.' });
    }
});

// --- CONVITES & LINKS ---

router.post('/invites/link', async (req, res) => {
  try {
    const { projectId, createdBy } = req.body;
    
    const projectExists = await db.exists(getKey('project', projectId));
    if (!projectExists) {
        return res.status(404).json({ message: 'Projeto não encontrado. Salve-o primeiro.' });
    }

    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const linkData = { token, projectId, createdBy, timestamp: Date.now() };
    
    await db.setEx(getKey('link', token), 86400, JSON.stringify(linkData));
    
    res.json({ token });
  } catch (e) { res.status(500).json({ message: 'Erro ao gerar link.' }); }
});

router.post('/invites/join', async (req, res) => {
  try {
    const { token, userEmail } = req.body;
    
    const linkJson = await db.get(getKey('link', token));
    if (!linkJson) return res.status(404).json({ message: 'Link inválido ou expirado.' });
    
    const link = JSON.parse(linkJson);
    const projectKey = getKey('project', link.projectId);
    const projectJson = await db.get(projectKey);
    
    if (!projectJson) return res.status(404).json({ message: 'Projeto não existe mais.' });
    
    const project = JSON.parse(projectJson);
    
    if (!project.members) project.members = [];
    if (!project.members.includes(userEmail)) {
        project.members.push(userEmail);
        project.lastModified = Date.now(); 
        await db.set(projectKey, JSON.stringify(project));
    }
    
    res.json(project);
  } catch (e) { res.status(500).json({ message: 'Erro ao entrar no projeto.' }); }
});

router.post('/invites/send', async (req, res) => {
  try {
    const { projectId, projectName, senderId, senderName, targetEmail } = req.body;
    
    const targetId = await db.get(getKey('email_map', targetEmail));
    if (!targetId) return res.status(404).json({ message: 'Usuário não encontrado.' });

    const inviteId = Math.random().toString(36).substr(2, 9);
    const invite = {
      id: inviteId,
      projectId, projectName, senderId, senderName, targetEmail,
      status: 'pending', timestamp: Date.now()
    };

    await db.set(getKey('invite', inviteId), JSON.stringify(invite));
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao enviar convite.' }); }
});

router.get('/invites/pending', async (req, res) => {
  try {
    const { email } = req.query;
    
    const keys = await db.keys('minegen:invite:*');
    if (keys.length === 0) return res.json([]);
    
    const invitesJson = await db.mGet(keys);
    const invites = invitesJson
        .map(i => i ? JSON.parse(i) : null)
        .filter(i => i && i.targetEmail === email && i.status === 'pending');

    res.json(invites);
  } catch (e) { res.status(500).json({ message: 'Erro ao buscar convites.' }); }
});

router.post('/invites/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;
    
    const inviteKey = getKey('invite', id);
    const inviteJson = await db.get(inviteKey);
    
    if (!inviteJson) return res.status(404).json({ message: 'Convite não encontrado.' });
    
    const invite = JSON.parse(inviteJson);
    
    let project = null;
    if (accept) {
        const projectKey = getKey('project', invite.projectId);
        const projectJson = await db.get(projectKey);
        
        if (projectJson) {
            project = JSON.parse(projectJson);
            if (!project.members) project.members = [];
            if (!project.members.includes(invite.targetEmail)) {
                project.members.push(invite.targetEmail);
                project.lastModified = Date.now();
                await db.set(projectKey, JSON.stringify(project));
            }
        }
    }
    
    await db.del(inviteKey);
    
    res.json(project || { success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao responder.' }); }
});

app.use('/api', router);

export default app;
