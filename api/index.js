
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

// --- Redis Client ---
const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
  if (process.env.REDIS_URL) {
    await client.connect();
    console.log("✅ Conectado ao Redis");
  } else {
    console.warn("⚠️ REDIS_URL não definida. O backend não funcionará corretamente sem Redis.");
  }
})();

// Helper Functions
const getKey = (type, id) => `minegen:${type}:${id}`;

// --- AUTH ---

router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password, savedApiKey } = req.body;

    // Verificar se email já existe (Ineficiente no Redis puro sem índice secundário, 
    // mas para MVP faremos um scan ou hash map de emails. Usaremos um Hash Map de emails)
    const emailKey = getKey('email_map', email);
    const existingId = await client.get(emailKey);

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

    // Salvar User e Mapeamento Email -> ID
    await client.set(getKey('user', userId), JSON.stringify(newUser));
    await client.set(emailKey, userId);

    const { password: _, ...userWithoutPass } = newUser;
    res.json(userWithoutPass);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Erro ao registrar.' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const userId = await client.get(getKey('email_map', email));
    if (!userId) return res.status(401).json({ message: 'Credenciais inválidas.' });

    const userJson = await client.get(getKey('user', userId));
    if (!userJson) return res.status(404).json({ message: 'Usuário não encontrado.' });

    const user = JSON.parse(userJson);
    if (user.password !== password) return res.status(401).json({ message: 'Credenciais inválidas.' });

    user.lastSeen = Date.now();
    await client.set(getKey('user', userId), JSON.stringify(user));

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
    
    const userJson = await client.get(getKey('user', id));
    if (!userJson) return res.status(404).json({ message: 'User not found' });

    const user = JSON.parse(userJson);
    const updatedUser = { ...user, ...updates };
    // Preservar senha se não enviada
    if (!updates.password) updatedUser.password = user.password;

    await client.set(getKey('user', id), JSON.stringify(updatedUser));
    
    const { password: _, ...clean } = updatedUser;
    res.json(clean);
  } catch (e) { res.status(500).json({ message: 'Erro ao atualizar.' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userJson = await client.get(getKey('user', id));
    if (userJson) {
        const user = JSON.parse(userJson);
        await client.del(getKey('email_map', user.email));
    }
    await client.del(getKey('user', id));
    // Nota: Não estamos deletando os projetos do usuário aqui para simplificar
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar.' }); }
});

// --- PROJETOS ---

router.get('/projects', async (req, res) => {
  try {
    const { ownerId } = req.query;
    if (!ownerId) return res.json([]);

    // Busca o email do usuário para verificar participação
    const userJson = await client.get(getKey('user', ownerId));
    if (!userJson) return res.json([]);
    const userEmail = JSON.parse(userJson).email;

    // Scan não é ideal para produção em massa, mas serve para MVP. 
    // Ideal: Ter um Set `user_projects:{userId}` com IDs dos projetos.
    // Vamos usar SCAN para buscar todos os projetos e filtrar (lento se tiver milhares, ok para MVP)
    
    const keys = await client.keys('minegen:project:*');
    if (keys.length === 0) return res.json([]);

    // MGET para pegar todos de uma vez
    const projectsJson = await client.mGet(keys);
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
    
    // Atualizar lastModified
    projectData.lastModified = Date.now();

    await client.set(getKey('project', id), JSON.stringify(projectData));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao salvar projeto.' }); }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await client.del(getKey('project', id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar projeto.' }); }
});

// --- CONVITES & LINKS ---

router.post('/invites/link', async (req, res) => {
  try {
    const { projectId, createdBy } = req.body;
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const linkData = { token, projectId, createdBy, timestamp: Date.now() };
    
    // Salva o link com expiração de 24h (86400s)
    await client.setEx(getKey('link', token), 86400, JSON.stringify(linkData));
    
    res.json({ token });
  } catch (e) { res.status(500).json({ message: 'Erro ao gerar link.' }); }
});

router.post('/invites/join', async (req, res) => {
  try {
    const { token, userEmail } = req.body;
    
    const linkJson = await client.get(getKey('link', token));
    if (!linkJson) return res.status(404).json({ message: 'Link inválido ou expirado.' });
    
    const link = JSON.parse(linkJson);
    const projectKey = getKey('project', link.projectId);
    const projectJson = await client.get(projectKey);
    
    if (!projectJson) return res.status(404).json({ message: 'Projeto não existe mais.' });
    
    const project = JSON.parse(projectJson);
    
    if (!project.members) project.members = [];
    if (!project.members.includes(userEmail)) {
        project.members.push(userEmail);
        project.lastModified = Date.now(); // Força update para todos
        await client.set(projectKey, JSON.stringify(project));
    }
    
    res.json(project);
  } catch (e) { res.status(500).json({ message: 'Erro ao entrar no projeto.' }); }
});

router.post('/invites/send', async (req, res) => {
  try {
    const { projectId, projectName, senderId, senderName, targetEmail } = req.body;
    
    // Verifica se target existe
    const targetId = await client.get(getKey('email_map', targetEmail));
    if (!targetId) return res.status(404).json({ message: 'Usuário não encontrado.' });

    const inviteId = Math.random().toString(36).substr(2, 9);
    const invite = {
      id: inviteId,
      projectId, projectName, senderId, senderName, targetEmail,
      status: 'pending', timestamp: Date.now()
    };

    // Salva convite
    await client.set(getKey('invite', inviteId), JSON.stringify(invite));
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao enviar convite.' }); }
});

router.get('/invites/pending', async (req, res) => {
  try {
    const { email } = req.query;
    
    // Mesma lógica de Scan (ideal seria uma lista por usuário)
    const keys = await client.keys('minegen:invite:*');
    if (keys.length === 0) return res.json([]);
    
    const invitesJson = await client.mGet(keys);
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
    const inviteJson = await client.get(inviteKey);
    
    if (!inviteJson) return res.status(404).json({ message: 'Convite não encontrado.' });
    
    const invite = JSON.parse(inviteJson);
    
    let project = null;
    if (accept) {
        const projectKey = getKey('project', invite.projectId);
        const projectJson = await client.get(projectKey);
        
        if (projectJson) {
            project = JSON.parse(projectJson);
            if (!project.members) project.members = [];
            if (!project.members.includes(invite.targetEmail)) {
                project.members.push(invite.targetEmail);
                project.lastModified = Date.now();
                await client.set(projectKey, JSON.stringify(project));
            }
        }
    }
    
    // Deleta o convite após responder
    await client.del(inviteKey);
    
    res.json(project || { success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao responder.' }); }
});

app.use('/api', router);

export default app;
