
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Menu, TerminalSquare } from 'lucide-react';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import AuthModal from './components/AuthModal';
import { PluginSettings, GeneratedProject, SavedProject, ChatMessage, GeneratedFile, User } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { saveDirectoryHandleToDB, getDirectoryHandleFromDB, getDirectoryHandle, readProjectFromDisk, detectProjectSettings, loadProjectStateFromDisk, saveProjectStateToDisk } from './services/fileSystem';
import { playSound } from './services/audioService';

const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => (Math.random() * 16 | (c === 'x' ? 0 : 0x8)).toString(16));

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => window.innerWidth > 768);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [pendingAiMessage, setPendingAiMessage] = useState<string | null>(null);
  
  const activeProject = projects.find(p => p.id === currentProjectId) || null;

  const addLog = (m: string) => setTerminalLogs(prev => [...prev, m]);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('minegen_user');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
      
      const savedProjectsStr = localStorage.getItem('minegen_projects');
      const savedLastId = localStorage.getItem('minegen_last_project_id');
      if (savedProjectsStr) {
        const parsed: SavedProject[] = JSON.parse(savedProjectsStr);
        setProjects(parsed);
        if (savedLastId && parsed.some(p => p.id === savedLastId)) setCurrentProjectId(savedLastId);
        else if (parsed.length > 0) setCurrentProjectId(parsed[0].id);
      } 
    } catch (e) { console.error(e); } finally { setIsLoaded(true); }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('minegen_projects', JSON.stringify(projects));
      if (currentUser) {
        localStorage.setItem('minegen_user', JSON.stringify(currentUser));
      } else {
        localStorage.removeItem('minegen_user');
      }
    }
  }, [projects, currentUser, isLoaded]);

  useEffect(() => {
    const loadHandle = async () => {
      setDirectoryHandle(null);
      if (currentProjectId) {
        const saved = await getDirectoryHandleFromDB(currentProjectId);
        if (saved) setDirectoryHandle(saved);
      }
    };
    loadHandle();
  }, [currentProjectId]);

  const handleInvite = (email: string) => {
    if (!activeProject) return;
    setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, members: [...p.members, email] } : p));
    addLog(`Sistema: Convite enviado para ${email}.`);
    playSound('success');
  };

  const handleOpenOrNewProject = async () => {
    try {
      const handle = await getDirectoryHandle();
      if (!handle) return; 
      const existing = await loadProjectStateFromDisk(handle);
      if (existing) {
          setProjects(prev => {
              const exists = prev.find(p => p.id === existing.id);
              if (exists) return prev.map(p => p.id === existing.id ? existing : p);
              return [existing, ...prev];
          });
          setCurrentProjectId(existing.id);
          setDirectoryHandle(handle);
          await saveDirectoryHandleToDB(existing.id, handle);
      } else {
          const loaded = await readProjectFromDisk(handle);
          const detected = detectProjectSettings(loaded.files);
          const newId = generateUUID();
          const newP: SavedProject = {
            id: newId,
            name: detected.name || handle.name,
            ownerId: currentUser?.id || 'guest',
            members: [],
            lastModified: Date.now(),
            settings: { ...DEFAULT_SETTINGS, name: detected.name || handle.name, ...detected },
            messages: [{ role: 'model', text: `Projeto vinculado: **${handle.name}**.` }],
            generatedProject: loaded.files.length > 0 ? loaded : null
          };
          setProjects(prev => [newP, ...prev]);
          setCurrentProjectId(newId);
          setDirectoryHandle(handle);
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

  if (!isLoaded) return <div className="bg-[#1e1e1e] h-screen w-full flex items-center justify-center text-gray-500 font-mono">Iniciando Workspace Cloud...</div>;

  return (
    <div className="flex h-[100dvh] w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans">
      <Sidebar 
        isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        projects={projects} currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId} onCreateProject={handleOpenOrNewProject}
        onDeleteProject={id => setProjects(p => p.filter(x => x.id !== id))}
        settings={activeProject?.settings || DEFAULT_SETTINGS} 
        setSettings={newS => setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, settings: typeof newS === 'function' ? newS(p.settings) : newS } : p))}
        currentUser={currentUser} onOpenLogin={() => setIsAuthModalOpen(true)} onLogout={() => setCurrentUser(null)}
        onInviteMember={handleInvite}
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
                <Menu className="w-12 h-12 opacity-10" />
                <h2 className="text-lg font-medium text-[#cccccc]">Acesse um Projeto</h2>
                <button onClick={handleOpenOrNewProject} className="bg-[#007acc] text-white px-6 py-2 rounded-lg shadow-lg hover:bg-[#0062a3] text-sm font-bold">Importar do Disco</button>
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
        onAuthSuccess={setCurrentUser} 
        initialUser={currentUser}
      />
    </div>
  );
};

export default App;
