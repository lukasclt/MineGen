
const express = require('express');
const cors = require('cors');
const { put, list, head } = require('@vercel/blob');
const fetch = require('node-fetch'); // Necessário para ambiente Node antigo, Vercel moderno já tem global
require('dotenv').config();

const app = express();

// Configuração CORS para permitir acesso do Frontend
app.use(cors({
  origin: '*', // Em produção, restrinja para seu domínio
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

const DB_FILENAME = 'minegen_database.json';
const INITIAL_DB = { users: [], projects: [], invites: [] };

// --- Helpers do Vercel Blob ---

async function getDBUrl() {
  // Tenta encontrar a URL do arquivo no Blob Storage
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
  // Se não houver token, usa memória volátil (modo fallback local sem .env)
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("BLOB_READ_WRITE_TOKEN não encontrado. Usando banco em memória (dados serão perdidos ao reiniciar).");
    if (!global.memoryDB) global.memoryDB = JSON.parse(JSON.stringify(INITIAL_DB));
    return global.memoryDB;
  }

  try {
    const url = await getDBUrl();
    if (!url) {
      // Cria o arquivo se não existir
      await writeDB(INITIAL_DB);
      return INITIAL_DB;
    }

    const response = await fetch(url + '?timestamp=' + Date.now()); // Anti-cache
    if (!response.ok) throw new Error('Falha ao baixar DB');
    return await response.json();
  } catch (error) {
    console.error("Erro ao ler DB:", error);
    return INITIAL_DB;
  }
}

async function writeDB(data) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    global.memoryDB = data;
    return;
  }

  try {
    // access: 'public' permite leitura via URL, mas escrita requer token
    // addRandomSuffix: false garante que sobrescrevemos o mesmo arquivo
    await put(DB_FILENAME, JSON.stringify(data, null, 2), { 
      access: 'public', 
      addRandomSuffix: false,
      contentType: 'application/json'
    });
  } catch (error) {
    console.error("Erro ao salvar DB:", error);
    throw new Error("Falha na persistência do Blob");
  }
}

// --- Rotas da API ---

app.get('/', (req, res) => {
  res.send('MineGen AI Backend is Running (Vercel Blob Mode)');
});

// Autenticação
app.post('/auth/register', async (req, res) => {
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
    res.status(500).json({ message: 'Erro interno ao registrar.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = await readDB();
    const user = db.users.find(u => u.email === email && u.password === password);

    if (!user) return res.status(401).json({ message: 'Credenciais inválidas.' });

    // Atualiza LastSeen
    user.lastSeen = Date.now();
    await writeDB(db);

    const { password: _, ...userWithoutPass } = user;
    res.json(userWithoutPass);
  } catch (e) {
    res.status(500).json({ message: 'Erro no login.' });
  }
});

app.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = await readDB();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ message: 'User not found' });

    db.users[idx] = { ...db.users[idx], ...updates };
    if (!updates.password) db.users[idx].password = db.users[idx].password; // Mantém senha antiga se não enviada

    await writeDB(db);
    const { password: _, ...clean } = db.users[idx];
    res.json(clean);
  } catch (e) { res.status(500).json({ message: 'Erro ao atualizar.' }); }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    db.users = db.users.filter(u => u.id !== id);
    db.projects = db.projects.filter(p => p.ownerId !== id);
    await writeDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar.' }); }
});

// Projetos
app.get('/projects', async (req, res) => {
  try {
    const { ownerId } = req.query;
    const db = await readDB();
    const projects = db.projects.filter(p => 
      p.ownerId === ownerId || (p.members && p.members.includes(db.users.find(u => u.id === ownerId)?.email))
    );
    res.json(projects);
  } catch (e) { res.status(500).json({ message: 'Erro ao listar projetos.' }); }
});

app.put('/projects/:id', async (req, res) => {
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

app.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    db.projects = db.projects.filter(p => p.id !== id);
    await writeDB(db);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao deletar projeto.' }); }
});

// Convites
app.post('/invites/send', async (req, res) => {
  try {
    const { projectId, projectName, senderId, senderName, targetEmail } = req.body;
    const db = await readDB();
    
    const target = db.users.find(u => u.email === targetEmail);
    if (!target) return res.status(404).json({ message: 'Usuário não encontrado.' });

    // Verifica online (5 min)
    const isOnline = target.lastSeen && (Date.now() - target.lastSeen < 5 * 60 * 1000);
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

app.get('/invites/pending', async (req, res) => {
  try {
    const { email } = req.query;
    const db = await readDB();
    const pending = db.invites.filter(i => i.targetEmail === email && i.status === 'pending');
    res.json(pending);
  } catch (e) { res.status(500).json({ message: 'Erro ao buscar convites.' }); }
});

app.post('/invites/:id/respond', async (req, res) => {
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
    
    db.invites = db.invites.filter(i => i.id !== id); // Limpa processados
    await writeDB(db);
    
    res.json(project || { success: true });
  } catch (e) { res.status(500).json({ message: 'Erro ao responder.' }); }
});

// Exporta o app para o Vercel Serverless
module.exports = app;
