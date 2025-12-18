
import React, { useState, useEffect, useCallback } from 'react';
import { Menu, TerminalSquare } from 'lucide-react';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import { PluginSettings, GeneratedProject, SavedProject, ChatMessage, GeneratedFile } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { saveDirectoryHandleToDB, getDirectoryHandleFromDB, getDirectoryHandle, readProjectFromDisk } from './services/fileSystem';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => window.innerWidth > 768);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Projects State
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // File System State (Persistent via IndexedDB)
  const [directoryHandle, setDirectoryHandle] = useState<any>(null);

  // Terminal State
  const [isTerminalOpen, setIsTerminalOpen] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  // Computed Current Project
  const activeProject = projects.find(p => p.id === currentProjectId) || null;

  const addLog = (message: string) => {
    setTerminalLogs(prev => [...prev, message]);
  };

  useEffect(() => {
    try {
      const savedProjectsStr = localStorage.getItem('minegen_projects');
      const savedLastId = localStorage.getItem('minegen_last_project_id');

      if (savedProjectsStr) {
        const parsedProjects: SavedProject[] = JSON.parse(savedProjectsStr);
        setProjects(parsedProjects);
        
        if (savedLastId && parsedProjects.some(p => p.id === savedLastId)) {
          setCurrentProjectId(savedLastId);
        } else if (parsedProjects.length > 0) {
          setCurrentProjectId(parsedProjects[0].id);
        }
      } 
    } catch (e) {
      console.error("Failed to load saved state", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('minegen_projects', JSON.stringify(projects));
    }
  }, [projects, isLoaded]);

  useEffect(() => {
    if (isLoaded && currentProjectId) {
      localStorage.setItem('minegen_last_project_id', currentProjectId);
    }
  }, [currentProjectId, isLoaded]);

  // Load Directory Handle from IndexedDB when project changes
  useEffect(() => {
    const loadHandle = async () => {
      setDirectoryHandle(null); // Reset first
      if (currentProjectId) {
        try {
          const savedHandle = await getDirectoryHandleFromDB(currentProjectId);
          if (savedHandle) {
            setDirectoryHandle(savedHandle);
            addLog(`Sistema: Manipulador de diretório carregado para projeto ${currentProjectId.substring(0,8)}`);
          }
        } catch (error) {
          console.error("Error loading directory handle:", error);
          addLog("Erro: Falha ao carregar manipulador de diretório do DB");
        }
      }
    };
    loadHandle();
  }, [currentProjectId]);

  const handleSetDirectoryHandle = async (handle: any) => {
    setDirectoryHandle(handle);
    addLog(`Sistema: Diretório "${handle.name}" vinculado com sucesso.`);
    if (currentProjectId && handle) {
      try {
        await saveDirectoryHandleToDB(currentProjectId, handle);
      } catch (error) {
        console.error("Failed to save handle to DB:", error);
      }
    }
  };

  const handleCreateNewProject = async () => {
    try {
      const handle = await getDirectoryHandle();
      if (!handle) return; 

      addLog(`Sistema: Lendo diretório "${handle.name}"...`);
      const loadedProject = await readProjectFromDisk(handle);
      const hasFiles = loadedProject.files.length > 0;
      addLog(`Sistema: ${loadedProject.files.length} arquivos encontrados.`);
      
      const newId = generateUUID();
      
      const newProject: SavedProject = {
        id: newId,
        name: handle.name || "Novo Projeto",
        lastModified: Date.now(),
        settings: { ...DEFAULT_SETTINGS, name: handle.name || DEFAULT_SETTINGS.name },
        messages: [{
          role: 'model',
          text: hasFiles 
            ? `📁 Pasta **${handle.name}** vinculada!\nEncontrei ${loadedProject.files.length} arquivos.\nComo posso ajudar?`
            : `📁 Pasta **${handle.name}** vinculada (Vazia).\nO que você gostaria de criar hoje?`
        }],
        generatedProject: hasFiles ? loadedProject : null
      };

      setProjects(prev => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      
      setDirectoryHandle(handle);
      await saveDirectoryHandleToDB(newId, handle);

      if (window.innerWidth < 768) setSidebarOpen(false);

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        alert("Erro ao criar projeto: " + error.message);
        addLog(`Erro: ${error.message}`);
      }
    }
  };

  const deleteProject = (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este projeto?")) return;
    const newProjects = projects.filter(p => p.id !== id);
    setProjects(newProjects);
    if (currentProjectId === id) {
      if (newProjects.length > 0) setCurrentProjectId(newProjects[0].id);
      else setCurrentProjectId(null);
    }
    addLog("Sistema: Projeto excluído.");
  };

  const updateActiveProject = useCallback((updates: Partial<SavedProject>) => {
    setProjects(prev => prev.map(p => {
      if (p.id === currentProjectId) {
        return { ...p, ...updates, lastModified: Date.now() };
      }
      return p;
    }));
  }, [currentProjectId]);

  const handleSettingsChange = (newSettings: React.SetStateAction<PluginSettings>) => {
    if (!activeProject) return;
    const resolvedSettings = typeof newSettings === 'function' ? newSettings(activeProject.settings) : newSettings;
    updateActiveProject({ settings: resolvedSettings });
  };

  const handleMessagesUpdate = (newMessagesOrUpdater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setProjects(prevProjects => prevProjects.map(p => {
      if (p.id === currentProjectId) {
        const currentMessages = p.messages || [];
        const updatedMessages = typeof newMessagesOrUpdater === 'function' 
          ? newMessagesOrUpdater(currentMessages)
          : newMessagesOrUpdater;
        
        // Simples log da última mensagem do usuário (se houver)
        const lastMsg = updatedMessages[updatedMessages.length - 1];
        if (lastMsg && lastMsg.role === 'model') {
             addLog("AI: Resposta gerada.");
        }

        return { ...p, messages: updatedMessages, lastModified: Date.now() };
      }
      return p;
    }));
  };

  // Lógica crítica: Mesclar arquivos novos com os existentes
  const handleProjectGenerated = (generated: GeneratedProject) => {
    if (!activeProject) return;

    addLog(`Sistema: Atualizando ${generated.files.length} arquivos no projeto...`);

    let mergedFiles: GeneratedFile[] = [];

    if (activeProject.generatedProject?.files) {
      mergedFiles = [...activeProject.generatedProject.files];
      
      // Update or add new files
      generated.files.forEach(newFile => {
        const existingIndex = mergedFiles.findIndex(f => f.path === newFile.path);
        if (existingIndex !== -1) {
          mergedFiles[existingIndex] = newFile;
          addLog(`Arquivo atualizado: ${newFile.path}`);
        } else {
          mergedFiles.push(newFile);
          addLog(`Arquivo criado: ${newFile.path}`);
        }
      });
    } else {
      mergedFiles = generated.files;
    }

    // Re-ordenar
    mergedFiles.sort((a, b) => {
      if (a.path === 'pom.xml' || a.path === 'build.gradle') return -1;
      return a.path.localeCompare(b.path);
    });

    updateActiveProject({ 
      generatedProject: {
        ...generated,
        files: mergedFiles
      } 
    });
    
    addLog("Sistema: Projeto atualizado com sucesso.");
  };

  // Call from CodeViewer
  const handleAddToContext = (fullMessage: string) => {
     addLog("Usuário: Instrução de código enviada.");
     handleMessagesUpdate(prev => [...prev, {
       role: 'user',
       text: fullMessage
     }]);
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  if (!isLoaded) return <div className="bg-[#1e1e1e] h-screen w-full flex items-center justify-center text-gray-500 font-mono">Loading workspace...</div>;

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans relative">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar 
        isOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={(id) => { setCurrentProjectId(id); addLog(`Sistema: Projeto trocado para ID ${id.substring(0,8)}`); }}
        onCreateProject={handleCreateNewProject}
        onDeleteProject={deleteProject}
        settings={activeProject?.settings || DEFAULT_SETTINGS} 
        setSettings={handleSettingsChange}
      />

      <div className="flex-1 flex flex-col md:flex-row h-full relative z-10 overflow-hidden">
        <div className="md:hidden h-12 border-b border-[#2b2b2b] flex items-center px-4 bg-[#252526] z-10 flex-shrink-0 justify-between">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="text-gray-300 mr-3">
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-white truncate max-w-[200px]">{activeProject?.name || "MineGen AI"}</span>
          </div>
        </div>

        <div className="flex-1 md:w-[35%] md:flex-none border-r border-[#2b2b2b] h-full overflow-hidden bg-[#1e1e1e] flex flex-col">
          {activeProject ? (
            <ChatInterface 
              key={activeProject.id}
              settings={activeProject.settings} 
              messages={activeProject.messages}
              setMessages={handleMessagesUpdate}
              currentProject={activeProject.generatedProject}
              onProjectGenerated={handleProjectGenerated}
              onClearProject={() => updateActiveProject({ generatedProject: null, messages: [] })}
              onUpdateProjectName={(name) => updateActiveProject({ name })}
              directoryHandle={directoryHandle}
              onSetDirectoryHandle={handleSetDirectoryHandle}
            />
          ) : (
             <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center space-y-4">
                <Menu className="w-12 h-12 opacity-20" />
                <h2 className="text-lg font-medium text-[#cccccc]">Sem projeto aberto</h2>
                <button onClick={handleCreateNewProject} className="bg-[#007acc] text-white px-4 py-2 rounded shadow-sm hover:bg-[#0062a3] text-sm">Abrir Pasta</button>
             </div>
          )}
        </div>

        {/* Right Area: CodeViewer + Terminal */}
        <div className="hidden md:flex flex-1 md:w-[65%] h-full overflow-hidden bg-[#1e1e1e] flex-col relative">
          <div className="flex-1 overflow-hidden relative">
             <CodeViewer 
              project={activeProject?.generatedProject || null} 
              settings={activeProject?.settings || DEFAULT_SETTINGS}
              directoryHandle={directoryHandle}
              onAddToContext={handleAddToContext}
            />
            {/* Toggle Terminal Button (Floating bottom right of code area if closed) */}
            {!isTerminalOpen && (
               <button 
                  onClick={() => setIsTerminalOpen(true)}
                  className="absolute bottom-4 right-6 bg-[#007acc] text-white p-2 rounded-full shadow-lg hover:bg-[#0062a3] z-50 transition-transform hover:scale-105"
                  title="Abrir Terminal"
               >
                 <TerminalSquare className="w-5 h-5" />
               </button>
            )}
          </div>
          
          <Terminal 
            logs={terminalLogs} 
            isOpen={isTerminalOpen} 
            onClose={() => setIsTerminalOpen(false)} 
            onClear={() => setTerminalLogs([])}
            onAddLog={addLog}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
