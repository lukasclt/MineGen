
import express from 'express';
import cors from 'cors';
import { put, list } from '@vercel/blob';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const router = express.Router();

// Configuração CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

const DB_FILENAME = 'minegen_db.json';
const INITIAL_DB = { users: [], projects: [], invites: [] };

// --- Vercel Blob Helpers ---

async function getDBUrl() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { blobs } = await list();
    const dbBlob = blobs.find(b => b.pathname === DB_FILENAME);
    return dbBlob ? dbBlob.url : null;
  } catch (e) {
    console.error("Erro ao listar blobs:", e);
    return null;
  }
}

async function readDB() {
  // Fallback para memória se não houver token (Dev Local sem .env)
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    if (!(global).memoryDB) (global).memoryDB = JSON.parse(JSON.stringify(INITIAL_DB));
    return (global).memoryDB;
  }

  try {
    const url = await getDBUrl();
    if (!url) {
      await writeDB(INITIAL_DB);
      return INITIAL_DB;
    }

    // Cache busting com timestamp para garantir dados frescos
    const response = await fetch(`${url}?t=${Date.now()}`);
    if (!response.ok) throw new Error('Falha ao baixar DB');
    return await response.json();
  } catch (error) {
    console.error("Erro ao ler DB do Blob:", error);
    return INITIAL_DB;
  }
}

async function writeDB(data) {
  // Fallback para memória
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    (global).memoryDB = data;
    return;
  }

  try {
    // Escreve usando Vercel Blob com addRandomSuffix: false para manter o nome constante
    await put(DB_FILENAME, JSON.stringify(data, null, 2), { 
      access: 'public', 
      addRandomSuffix: false,
      contentType: 'application/json'
    });
  } catch (error) {
    console.error("Erro ao salvar no Blob:", error);
    throw new Error("Falha na persistência do Blob");
  }
}

// --- Rotas (Montadas no Router) ---

router.get('/', (req, res) => {
  res.send('MineGen AI Backend (Vercel Blob Active)');
});

// AUTH
router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password, savedApiKey } = req.body;
    const db = await readDB();

    if (db.users.find(u => u.email === email)) {
      return res.status(400).json({ message: 'E-mail já cadastrado.' });
    }

    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      email,
      password,
      savedApiKey,
      lastSeen: Date.now()
    };

    db.users.push(newUser);
    await writeDB(db);

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
    const db = await readDB();
    const user = db.users.find(u => u.email === email && u.password === password);

    if (!user) return res.status(401).json({ message: 'Credenciais inválidas.' });

    user.lastSeen = Date.now();
    await writeDB(db);

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
    const db = await readDB();
    const idx = db.users.findIndex(u => u.id === id);
    
    if (idx === -1) return res.status(404).json({ message: 'User not found' });

    db.users[idx] = { ...db.users[idx], ...updates };
    // Mantém a senha antiga se não enviada
    if (!updates.password) db.users[idx].password = db.users[idx].password;

    await writeDB(db);
    const { password: _, ...clean } = db.users[idx];
    res.json(clean);
  } catch (e) { res.status(500).json({ message: 'Erro ao atualizar.' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    db.users = db.users.filter(u => u.id !== id);
    db.projects = db.projects.filter(p => p.ownerId !== id);
    await writeDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar.' }); }
});

// PROJETOS
router.get('/projects', async (req, res) => {
  try {
    const { ownerId } = req.query;
    const db = await readDB();
    const projects = db.projects.filter(p => 
      p.ownerId === ownerId || (p.members && p.members.includes(db.users.find(u => u.id === ownerId)?.email))
    );
    res.json(projects);
  } catch (e) { res.status(500).json({ message: 'Erro ao listar projetos.' }); }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectData = req.body;
    const db = await readDB();
    
    const idx = db.projects.findIndex(p => p.id === id);
    if (idx === -1) db.projects.push(projectData);
    else db.projects[idx] = projectData;

    await writeDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao salvar projeto.' }); }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    db.projects = db.projects.filter(p => p.id !== id);
    await writeDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar projeto.' }); }
});

// CONVITES
router.post('/invites/send', async (req, res) => {
  try {
    const { projectId, projectName, senderId, senderName, targetEmail } = req.body;
    const db = await readDB();
    
    const target = db.users.find(u => u.email === targetEmail);
    if (!target) return res.status(404).json({ message: 'Usuário não encontrado.' });

    const isOnline = target.lastSeen && (Date.now() - target.lastSeen < 10 * 60 * 1000); 
    if (!isOnline) return res.status(409).json({ message: 'Usuário offline.' });

    db.invites.push({
      id: Math.random().toString(36).substr(2, 9),
      projectId, projectName, senderId, senderName, targetEmail,
      status: 'pending', timestamp: Date.now()
    });
    
    await writeDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao enviar convite.' }); }
});

router.get('/invites/pending', async (req, res) => {
  try {
    const { email } = req.query;
    const db = await readDB();
    const pending = db.invites.filter(i => i.targetEmail === email && i.status === 'pending');
    res.json(pending);
  } catch (e) { res.status(500).json({ message: 'Erro ao buscar convites.' }); }
});

router.post('/invites/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;
    const db = await readDB();
    
    const idx = db.invites.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ message: 'Convite não encontrado.' });
    
    const invite = db.invites[idx];
    invite.status = accept ? 'accepted' : 'rejected';
    
    let project = null;
    if (accept) {
      const pIdx = db.projects.findIndex(p => p.id === invite.projectId);
      if (pIdx !== -1) {
        if (!db.projects[pIdx].members) db.projects[pIdx].members = [];
        if (!db.projects[pIdx].members.includes(invite.targetEmail)) {
           db.projects[pIdx].members.push(invite.targetEmail);
        }
        project = db.projects[pIdx];
      }
    }
    
    db.invites = db.invites.filter(i => i.id !== id);
    await writeDB(db);
    
    res.json(project || { success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao responder.' }); }
});

// IMPORTANTE: Monta o router em /api para coincidir com a reescrita do Vercel e chamadas do frontend
app.use('/api', router);

export default app;
