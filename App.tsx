
import React, { useState, useEffect, useCallback } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import { PluginSettings, GeneratedProject, SavedProject, ChatMessage } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generatePluginCode } from './services/geminiService';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const App: React.FC = () => {
  // Fix: Initializer for useState should be a parameterless function or a value. 
  // This fix ensures sidebarOpen is correctly inferred as a boolean.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => window.innerWidth > 768);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Projects State
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Computed Current Project
  const activeProject = projects.find(p => p.id === currentProjectId) || null;

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

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
        } else {
          createNewProject();
        }
      } else {
        createNewProject();
      }
    } catch (e) {
      console.error("Failed to load saved state", e);
      createNewProject();
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

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null);
        setShowInstallButton(false);
      });
    }
  };

  const createNewProject = () => {
    const newProject: SavedProject = {
      id: generateUUID(),
      name: "Novo Projeto",
      lastModified: Date.now(),
      settings: { ...DEFAULT_SETTINGS },
      messages: [{
        role: 'model',
        text: `Olá! Eu sou o MineGen AI. Configure seu projeto na barra lateral e me diga o que você quer criar!`
      }],
      generatedProject: null
    };

    setProjects(prev => [newProject, ...prev]);
    setCurrentProjectId(newProject.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const deleteProject = (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este projeto?")) return;
    const newProjects = projects.filter(p => p.id !== id);
    setProjects(newProjects);
    if (currentProjectId === id) {
      if (newProjects.length > 0) setCurrentProjectId(newProjects[0].id);
      else createNewProject();
    }
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

  const handleMessagesUpdate = (newMessages: ChatMessage[]) => {
    updateActiveProject({ messages: newMessages });
  };

  const handleProjectGenerated = (generated: GeneratedProject) => {
    updateActiveProject({ generatedProject: generated });
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  if (!isLoaded) return <div className="bg-mc-dark h-screen w-full flex items-center justify-center text-gray-500">Loading workspace...</div>;

  return (
    <div className="flex h-screen w-full bg-mc-dark text-white overflow-hidden font-sans relative">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-grid-animate opacity-30"></div>
        <div className="absolute inset-0 bg-radial-gradient"></div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar 
        isOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={(id) => { setCurrentProjectId(id); }}
        onCreateProject={createNewProject}
        onDeleteProject={deleteProject}
        settings={activeProject?.settings || DEFAULT_SETTINGS} 
        setSettings={handleSettingsChange}
        showInstallButton={showInstallButton}
        onInstall={handleInstallClick}
      />

      <div className="flex-1 flex flex-col md:flex-row h-full relative z-10">
        <div className="md:hidden h-14 border-b border-gray-700 flex items-center px-4 bg-mc-panel z-10 flex-shrink-0 justify-between">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="text-gray-300 mr-3">
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-white truncate max-w-[200px]">{activeProject?.name || "MineGen AI"}</span>
          </div>
        </div>

        <div className="flex-1 md:w-[40%] md:flex-none border-r border-gray-800 h-full overflow-hidden bg-mc-dark/50 backdrop-blur-sm">
          {activeProject && (
            <ChatInterface 
              key={activeProject.id}
              settings={activeProject.settings} 
              messages={activeProject.messages}
              setMessages={handleMessagesUpdate}
              currentProject={activeProject.generatedProject}
              onProjectGenerated={handleProjectGenerated}
              onClearProject={() => updateActiveProject({ generatedProject: null, messages: [] })}
              onUpdateProjectName={(name) => updateActiveProject({ name })}
            />
          )}
        </div>

        <div className="hidden md:flex flex-1 md:w-[60%] h-full overflow-hidden shadow-2xl">
          <CodeViewer 
            project={activeProject?.generatedProject || null} 
            settings={activeProject?.settings || DEFAULT_SETTINGS}
            onProjectUpdate={handleProjectGenerated}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
