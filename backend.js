
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Limite aumentado para projetos grandes

// --- Helpers de Banco de Dados ---

// Estrutura inicial do DB
const INITIAL_DB = {
  users: [],
  projects: [],
  invites: []
};

// Ler o banco de dados
async function readDB() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // Se não existir, cria um novo
    await fs.writeFile(DB_FILE, JSON.stringify(INITIAL_DB, null, 2));
    return INITIAL_DB;
  }
}

// Salvar no banco de dados
async function writeDB(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
}

// --- Middleware de "Online" ---
// Atualiza o lastSeen do usuário a cada requisição autenticada (simulado)
async function updateUserActivity(userId) {
  if (!userId) return;
  const db = await readDB();
  const userIndex = db.users.findIndex(u => u.id === userId);
  if (userIndex !== -1) {
    db.users[userIndex].lastSeen = Date.now();
    await writeDB(db);
  }
}

// --- Rotas de Autenticação ---

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
      password, // Em produção, use hash! Para local, texto puro ok.
      savedApiKey,
      lastSeen: Date.now()
    };

    db.users.push(newUser);
    await writeDB(db);

    const { password: _, ...userWithoutPass } = newUser;
    res.json(userWithoutPass);
  } catch (e) {
    res.status(500).json({ message: 'Erro ao registrar.' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = await readDB();
    const user = db.users.find(u => u.email === email && u.password === password);

    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

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
    
    const index = db.users.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ message: 'Usuário não encontrado' });

    // Atualiza campos permitidos
    db.users[index] = { ...db.users[index], ...updates };
    // Não permite apagar senha se não enviada
    if (!updates.password) db.users[index].password = db.users[index].password;

    await writeDB(db);
    const { password: _, ...userWithoutPass } = db.users[index];
    res.json(userWithoutPass);
  } catch (e) {
    res.status(500).json({ message: 'Erro ao atualizar.' });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    db.users = db.users.filter(u => u.id !== id);
    // Remove projetos do usuário também
    db.projects = db.projects.filter(p => p.ownerId !== id);
    await writeDB(db);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Erro ao deletar.' });
  }
});

// --- Rotas de Projetos ---

app.get('/projects', async (req, res) => {
  try {
    const { ownerId } = req.query;
    const db = await readDB();
    // Retorna projetos onde o usuário é dono OU membro
    const projects = db.projects.filter(p => 
      p.ownerId === ownerId || (p.members && p.members.includes(db.users.find(u => u.id === ownerId)?.email))
    );
    res.json(projects);
  } catch (e) {
    res.status(500).json({ message: 'Erro ao carregar projetos.' });
  }
});

app.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectData = req.body;
    const db = await readDB();

    const index = db.projects.findIndex(p => p.id === id);
    if (index === -1) {
      db.projects.push(projectData);
    } else {
      db.projects[index] = projectData;
    }

    await writeDB(db);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Erro ao salvar projeto.' });
  }
});

app.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await readDB();
    db.projects = db.projects.filter(p => p.id !== id);
    await writeDB(db);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Erro ao deletar projeto.' });
  }
});

// --- Rotas de Convites ---

app.post('/invites/send', async (req, res) => {
  try {
    const { projectId, projectName, senderId, senderName, targetEmail } = req.body;
    const db = await readDB();

    const targetUser = db.users.find(u => u.email === targetEmail);
    if (!targetUser) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    // Verificar se está Online (ativo nos últimos 5 min)
    const FIVE_MINUTES = 5 * 60 * 1000;
    const isOnline = targetUser.lastSeen && (Date.now() - targetUser.lastSeen < FIVE_MINUTES);

    if (!isOnline) {
       // Retornamos 409 Conflict para indicar offline, conforme lógica do frontend
       return res.status(409).json({ message: 'Usuário offline.' });
    }

    const newInvite = {
      id: Math.random().toString(36).substr(2, 9),
      projectId,
      projectName,
      senderId,
      senderName,
      targetEmail,
      status: 'pending',
      timestamp: Date.now()
    };

    db.invites.push(newInvite);
    await writeDB(db);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: 'Erro ao enviar convite.' });
  }
});

app.get('/invites/pending', async (req, res) => {
  try {
    const { email } = req.query;
    const db = await readDB();
    const pending = db.invites.filter(i => i.targetEmail === email && i.status === 'pending');
    res.json(pending);
  } catch (e) {
    res.status(500).json({ message: 'Erro ao buscar convites.' });
  }
});

app.post('/invites/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { accept } = req.body;
    const db = await readDB();

    const inviteIndex = db.invites.findIndex(i => i.id === id);
    if (inviteIndex === -1) return res.status(404).json({ message: 'Convite não encontrado' });

    const invite = db.invites[inviteIndex];
    invite.status = accept ? 'accepted' : 'rejected';

    let project = null;

    if (accept) {
      const projIndex = db.projects.findIndex(p => p.id === invite.projectId);
      if (projIndex !== -1) {
        // Adiciona o email do usuário aos membros do projeto
        if (!db.projects[projIndex].members) db.projects[projIndex].members = [];
        if (!db.projects[projIndex].members.includes(invite.targetEmail)) {
           db.projects[projIndex].members.push(invite.targetEmail);
        }
        project = db.projects[projIndex];
      }
    }

    // Remove o convite da lista (ou mantem como histórico, aqui vamos remover os processados para limpar)
    db.invites = db.invites.filter(i => i.id !== id);

    await writeDB(db);
    
    // Se aceitou, retorna o projeto para o frontend carregar imediatamente
    res.json(project || { success: true });
  } catch (e) {
    res.status(500).json({ message: 'Erro ao responder convite.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend Server running on http://localhost:${PORT}`);
  console.log(`Database File: ${DB_FILE}`);
});
