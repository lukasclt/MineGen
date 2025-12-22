
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Menu, TerminalSquare, Cloud, CloudOff, RefreshCw, Database, Check, X, FolderInput, AlertTriangle } from 'lucide-react';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import AuthModal from './components/AuthModal';
import { PluginSettings, GeneratedProject, SavedProject, ChatMessage, GeneratedFile, User } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { saveDirectoryHandleToDB, getDirectoryHandleFromDB, getDirectoryHandle, readProjectFromDisk, detectProjectSettings, loadProjectStateFromDisk, saveProjectStateToDisk, verifyPermission, checkPermissionStatus } from './services/fileSystem';
import { dbService, Invite } from './services/dbService';
import { playSound, speakText } from './services/audioService';

const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => (Math.random() * 16 | (c === 'x' ? 0 : 0x8)).toString(16));

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => window.innerWidth > 768);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [hasFilePermission, setHasFilePermission] = useState<boolean>(false);
  
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [pendingAiMessage, setPendingAiMessage] = useState<string | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<Invite | null>(null);
  
  const activeProject = projects.find(p => p.id === currentProjectId) || null;
  const isBackendConnected = !!((process.env as any).API_URL || true); 

  const addLog = (m: string) => setTerminalLogs(prev => [...prev, m]);

  useEffect(() => {
    const init = async () => {
      try {
        const savedUser = localStorage.getItem('minegen_user');
        const cachedProjects = localStorage.getItem('minegen_projects');
        
        if (cachedProjects) {
          try {
            const parsedProjects = JSON.parse(cachedProjects);
            setProjects(parsedProjects);
            addLog("Sistema: Projetos carregados do cache local.");
          } catch (e) {
            console.error("Cache inválido", e);
          }
        }

        const savedLastId = localStorage.getItem('minegen_last_project_id');
        if (savedLastId) setCurrentProjectId(savedLastId);

        if (savedUser) {
          const user = JSON.parse(savedUser);
          setCurrentUser(user);
          setIsCloudSyncing(true);
          try {
            await syncWithCloud(user.id);
          } catch (err) {
            addLog("Aviso: Falha ao conectar na nuvem.");
          } finally {
            setIsCloudSyncing(false);
          }
          checkInviteLink(user);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoaded(true);
      }
    };
    init();
  }, []);

  const syncWithCloud = async (userId: string) => {
    const cloudProjects = await dbService.loadUserProjects(userId);
    if (cloudProjects.length > 0) {
      setProjects(prevLocal => {
        const merged = [...prevLocal];
        const sanitizedCloud = cloudProjects.map(p => ({
            ...p, 
            members: p.members || [],
            ownerName: p.ownerName || 'Desconhecido' 
        }));

        sanitizedCloud.forEach(cloudP => {
          const localIdx = merged.findIndex(p => p.id === cloudP.id);
          if (localIdx === -1) {
            merged.push(cloudP);
          } else {
            const localP = merged[localIdx];
            
            // Lógica de Merge Aprimorada:
            // Sincroniza se o cloud for mais novo, se tiver mais mensagens OU se a lista de membros for diferente
            const cloudMessagesHash = JSON.stringify(cloudP.messages.map(m => m.status + m.id));
            const localMessagesHash = JSON.stringify(localP.messages.map(m => m.status + m.id));
            const cloudMembersHash = JSON.stringify(cloudP.members.sort());
            const localMembersHash = JSON.stringify(localP.members.sort());

            if (cloudP.lastModified > localP.lastModified || 
                cloudMessagesHash !== localMessagesHash ||
                cloudMembersHash !== localMembersHash) {
               merged[localIdx] = cloudP;
            }
          }
        });
        return merged;
      });
    }
  };

  const checkInviteLink = async (user: User) => {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get('invite');
      if (inviteToken) {
          setIsCloudSyncing(true);
          try {
              addLog("Sistema: Processando link de convite...");
              const project = await dbService.joinProjectByLink(inviteToken, user.email);
              setProjects(prev => {
                  if (prev.find(p => p.id === project.id)) return prev;
                  return [project, ...prev];
              });
              setCurrentProjectId(project.id);
              playSound('success');
              addLog(`Sistema: Você entrou no projeto ${project.name} via link!`);
              window.history.replaceState({}, document.title, window.location.pathname);
          } catch (e: any) {
              addLog(`Erro Convite: ${e.message}`);
              playSound('error');
          } finally {
              setIsCloudSyncing(false);
          }
      }
  };

  // POLLING DE SINCRONIZAÇÃO
  useEffect(() => {
    if (!currentUser) return;
    
    // Intervalo de sync mais rápido se tiver projeto aberto (para ver animação e membros entrando)
    const syncIntervalTime = currentProjectId ? 2000 : 8000; 

    const syncLoop = async () => {
        if (!document.hidden) { 
            await syncWithCloud(currentUser.id);
        }
    };

    const checkInvites = async () => {
      const invites = await dbService.checkPendingInvites(currentUser.email);
      if (invites.length > 0 && !incomingInvite) {
        const invite = invites[0];
        setIncomingInvite(invite);
        playSound('message');
        speakText(`Você tem um novo convite de ${invite.senderName} para o projeto ${invite.projectName}`);
      }
    };

    const intervalSync = setInterval(syncLoop, syncIntervalTime);
    const intervalInvite = setInterval(checkInvites, 5000);

    return () => {
        clearInterval(intervalSync);
        clearInterval(intervalInvite);
    };
  }, [currentUser, incomingInvite, currentProjectId]); 

  useEffect(() => {
    if (isLoaded) {
      if (currentProjectId) localStorage.setItem('minegen_last_project_id', currentProjectId);
      localStorage.setItem('minegen_projects', JSON.stringify(projects));
      if (currentUser) {
        localStorage.setItem('minegen_user', JSON.stringify(currentUser));
        if (activeProject) dbService.saveProject(activeProject);
      } else {
        localStorage.removeItem('minegen_user');
      }
    }
  }, [projects, currentUser, isLoaded, currentProjectId]);

  useEffect(() => {
    const loadHandle = async () => {
      setDirectoryHandle(null);
      setHasFilePermission(false);

      if (currentProjectId) {
        const saved = await getDirectoryHandleFromDB(currentProjectId);
        if (saved) {
             setDirectoryHandle(saved);
             const status = await checkPermissionStatus(saved);
             setHasFilePermission(status === 'granted');
        }
      }
    };
    loadHandle();
  }, [currentProjectId]);

  const handleReconnectFolder = async () => {
      if (!directoryHandle) return;
      try {
          const granted = await verifyPermission(directoryHandle, true);
          if (granted) {
              setHasFilePermission(true);
              playSound('success');
              addLog("Sistema: Pasta reconectada com sucesso.");
          }
      } catch (e) {
          addLog("Erro ao reconectar pasta.");
      }
  };

  const handleAuthSuccess = async (user: User) => {
    setCurrentUser(user);
    setIsCloudSyncing(true);
    await syncWithCloud(user.id);
    setIsCloudSyncing(false);
    setIsAuthModalOpen(false);
    addLog(`Sistema: Bem-vindo, ${user.username}!`);
    playSound('success');
    checkInviteLink(user);
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    setIsCloudSyncing(true);
    const success = await dbService.deleteUser(currentUser.id);
    setIsCloudSyncing(false);
    if (success) {
      setCurrentUser(null);
      setProjects([]);
      setDirectoryHandle(null);
      setCurrentProjectId(null);
      localStorage.clear(); 
      addLog("Sistema: Conta excluída.");
      playSound('message');
    } else {
      addLog("Erro: Falha ao excluir conta.");
      playSound('error');
    }
  };

  const handleInvite = (email: string) => {
    if (!activeProject) return;
    setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, members: [...(p.members || []), email] } : p));
    addLog(`Sistema: Convite adicionado localmente para ${email}.`);
  };

  const handleRespondInvite = async (accept: boolean) => {
    if (!incomingInvite) return;
    setIsCloudSyncing(true);
    try {
      const project = await dbService.respondToInvite(incomingInvite.id, accept);
      if (accept && project) {
         const sanitized = { ...project, members: project.members || [] };
         setProjects(prev => [sanitized, ...prev]);
         setCurrentProjectId(sanitized.id);
         playSound('success');
         addLog(`Sistema: Você entrou no projeto ${project.name}.`);
      } else if (!accept) {
         addLog("Sistema: Convite recusado.");
      }
    } catch (e) {
      console.error(e);
      addLog("Erro ao responder convite.");
    } finally {
      setIsCloudSyncing(false);
      setIncomingInvite(null);
    }
  };

  const handleOpenOrNewProject = async () => {
    try {
      const handle = await getDirectoryHandle();
      if (!handle) return; 
      const existing = await loadProjectStateFromDisk(handle);
      if (existing) {
          const safeExisting = { ...existing, members: existing.members || [] };
          setProjects(prev => {
              const exists = prev.find(p => p.id === safeExisting.id);
              if (exists) return prev.map(p => p.id === safeExisting.id ? safeExisting : p);
              return [safeExisting, ...prev];
          });
          setCurrentProjectId(safeExisting.id);
          setDirectoryHandle(handle);
          setHasFilePermission(true);
          await saveDirectoryHandleToDB(safeExisting.id, handle);
      } else {
          const loaded = await readProjectFromDisk(handle);
          const detected = detectProjectSettings(loaded.files);
          const newId = generateUUID();
          
          // CRÍTICO: Definindo ownerName na criação
          const newP: SavedProject = {
            id: newId,
            name: detected.name || handle.name,
            ownerId: currentUser?.id || 'guest',
            ownerName: currentUser?.username || 'Convidado', // Correção do Dono
            members: [],
            lastModified: Date.now(),
            settings: { ...DEFAULT_SETTINGS, name: detected.name || handle.name, ...detected },
            messages: [{ role: 'model', text: `Projeto vinculado: **${handle.name}**.` }],
            generatedProject: loaded.files.length > 0 ? loaded : null
          };
          setProjects(prev => [newP, ...prev]);
          setCurrentProjectId(newId);
          setDirectoryHandle(handle);
          setHasFilePermission(true);
          await saveDirectoryHandleToDB(newId, handle);
      }
    } catch (e: any) { addLog(`Erro: ${e.message}`); }
  };

  const handleProjectGenerated = (generated: GeneratedProject) => {
    if (!activeProject) return;
    let merged = [...(activeProject.generatedProject?.files || [])];
    generated.files.forEach(f => {
      const idx = merged.findIndex(ex => ex.path === f.path);
      if (idx !== -1) merged[idx] = f; else merged.push(f);
    });
    setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, generatedProject: { ...generated, files: merged }, lastModified: Date.now() } : p));
  };

  const handleDeleteProject = async (id: string) => {
    setProjects(p => p.filter(x => x.id !== id));
    if (currentUser) {
      await dbService.deleteProject(id);
    }
  };

  if (!isLoaded) return <div className="bg-[#1e1e1e] h-screen w-full flex items-center justify-center text-gray-500 font-mono">Iniciando Workspace...</div>;

  if (!currentUser) {
      return (
          <div className="h-[100dvh] w-full bg-[#1e1e1e] flex items-center justify-center relative overflow-hidden">
             <div className="absolute inset-0 bg-grid-animate opacity-20 pointer-events-none"></div>
             <div className="absolute inset-0 bg-radial-gradient pointer-events-none"></div>
             <AuthModal 
               isOpen={true} 
               onClose={() => {}}
               onAuthSuccess={handleAuthSuccess}
               canClose={false}
             />
          </div>
      );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans relative">
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        {directoryHandle && !hasFilePermission && (
             <button 
                onClick={handleReconnectFolder}
                className="bg-yellow-500/10 border border-yellow-500/50 hover:bg-yellow-500/20 text-yellow-200 rounded-full px-3 py-1 text-[10px] font-bold flex items-center gap-2 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.2)] transition-all cursor-pointer pointer-events-auto"
                title="Clique para autorizar a escrita de arquivos novamente"
             >
                <AlertTriangle className="w-3 h-3 text-yellow-500" />
                Reconectar Pasta
             </button>
        )}

        {isCloudSyncing ? (
          <div className="bg-mc-panel border border-mc-accent/30 rounded-full px-3 py-1 text-[10px] text-mc-accent flex items-center gap-2 pointer-events-none">
            <RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando...
          </div>
        ) : isBackendConnected ? (
          <div className="bg-mc-panel border border-mc-green/30 rounded-full px-3 py-1 text-[10px] text-mc-green flex items-center gap-2 pointer-events-none">
            <Database className="w-3 h-3" /> Cloud Ativa
          </div>
        ) : (
          <div className="bg-mc-panel border border-red-500/30 rounded-full px-3 py-1 text-[10px] text-red-400 flex items-center gap-2 pointer-events-none">
            <CloudOff className="w-3 h-3" /> Modo Local
          </div>
        )}
      </div>

      <Sidebar 
        isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        projects={projects} currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId} onCreateProject={handleOpenOrNewProject}
        onDeleteProject={handleDeleteProject}
        settings={activeProject?.settings || DEFAULT_SETTINGS} 
        setSettings={newS => setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, settings: typeof newS === 'function' ? newS(p.settings) : newS } : p))}
        currentUser={currentUser} onOpenLogin={() => setIsAuthModalOpen(true)} onLogout={() => setCurrentUser(null)}
        onInviteMember={handleInvite}
        onDeleteAccount={handleDeleteAccount}
      />

      <div className="flex-1 flex flex-col md:flex-row h-full min-w-0">
        <div className="flex-1 md:w-[35%] h-full flex flex-col min-w-0">
          {activeProject ? (
            <ChatInterface 
              key={activeProject.id} settings={activeProject.settings} messages={activeProject.messages}
              setMessages={upd => setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, messages: typeof upd === 'function' ? upd(p.messages) : upd } : p))}
              currentProject={activeProject.generatedProject} onProjectGenerated={handleProjectGenerated}
              directoryHandle={directoryHandle} onSetDirectoryHandle={setDirectoryHandle}
              pendingMessage={pendingAiMessage} onClearPendingMessage={() => setPendingAiMessage(null)}
              currentUser={currentUser}
            />
          ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-gray-800/50 flex items-center justify-center mb-4">
                   <TerminalSquare className="w-10 h-10 opacity-20" />
                </div>
                <h2 className="text-lg font-medium text-[#cccccc]">Bem-vindo ao MineGen Workspace</h2>
                <p className="text-xs text-gray-500 max-w-xs leading-relaxed">Seus projetos são salvos automaticamente no Cache Local e Vercel Blob.</p>
                <button onClick={handleOpenOrNewProject} className="bg-mc-accent text-white px-8 py-2.5 rounded-lg shadow-lg hover:bg-[#0062a3] text-sm font-bold transition-all">Importar / Novo Projeto</button>
             </div>
          )}
        </div>

        <div className="hidden md:flex flex-1 md:w-[65%] h-full flex-col min-w-0">
          <div className="flex-1 relative overflow-hidden flex flex-col min-h-0">
             <CodeViewer 
              project={activeProject?.generatedProject || null} settings={activeProject?.settings || DEFAULT_SETTINGS}
              directoryHandle={directoryHandle} onAddToContext={setPendingAiMessage}
            />
          </div>
          <Terminal logs={terminalLogs} isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} onClear={() => setTerminalLogs([])} onAddLog={addLog} />
        </div>
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onAuthSuccess={handleAuthSuccess} 
        initialUser={currentUser}
      />

      {incomingInvite && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-mc-panel border border-mc-accent w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-slide-up">
                <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-mc-accent/20 text-mc-accent flex items-center justify-center mx-auto mb-4">
                       <Cloud className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2">Novo Convite</h3>
                    <p className="text-sm text-gray-400 mb-6">
                       <strong>{incomingInvite.senderName}</strong> convidou você para colaborar no projeto <strong className="text-white">{incomingInvite.projectName}</strong>.
                    </p>
                    <div className="flex gap-3">
                       <button onClick={() => handleRespondInvite(true)} className="flex-1 bg-mc-green hover:bg-green-600 text-black font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all">
                          <Check className="w-4 h-4" /> Aceitar
                       </button>
                       <button onClick={() => handleRespondInvite(false)} className="flex-1 bg-gray-700 hover:bg-red-500/50 hover:text-red-200 text-gray-300 font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all">
                          <X className="w-4 h-4" /> Recusar
                       </button>
                    </div>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default App;
