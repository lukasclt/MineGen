import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import { PluginSettings, GeneratedProject, SavedProject, ChatMessage } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { v4 as uuidv4 } from 'uuid'; // We'll implement a simple uuid generator helper since we don't have the lib

// Simple UUID generator helper
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Projects State
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Computed Current Project
  const activeProject = projects.find(p => p.id === currentProjectId) || null;

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  // Load state from localStorage on mount
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

  // Save state whenever projects change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('minegen_projects', JSON.stringify(projects));
    }
  }, [projects, isLoaded]);

  // Save current project ID
  useEffect(() => {
    if (isLoaded && currentProjectId) {
      localStorage.setItem('minegen_last_project_id', currentProjectId);
    }
  }, [currentProjectId, isLoaded]);

  // Handle PWA Install Prompt
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
      deferredPrompt.userChoice.then((choiceResult: any) => {
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
    if (window.innerWidth < 768) setSidebarOpen(false); // Close sidebar on mobile
  };

  const deleteProject = (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este projeto?")) return;
    
    const newProjects = projects.filter(p => p.id !== id);
    setProjects(newProjects);
    
    if (currentProjectId === id) {
      if (newProjects.length > 0) {
        setCurrentProjectId(newProjects[0].id);
      } else {
        createNewProject();
      }
    }
  };

  const updateActiveProject = (updates: Partial<SavedProject>) => {
    setProjects(prev => prev.map(p => {
      if (p.id === currentProjectId) {
        return { ...p, ...updates, lastModified: Date.now() };
      }
      return p;
    }));
  };

  const handleSettingsChange = (newSettings: React.SetStateAction<PluginSettings>) => {
    if (!activeProject) return;
    
    const resolvedSettings = typeof newSettings === 'function' 
      ? newSettings(activeProject.settings) 
      : newSettings;

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
      
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-grid-animate opacity-30"></div>
        <div className="absolute inset-0 bg-radial-gradient"></div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <Sidebar 
        isOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
        
        // Project Management Props
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId}
        onCreateProject={createNewProject}
        onDeleteProject={deleteProject}
        
        // Config Props (Active Project)
        settings={activeProject?.settings || DEFAULT_SETTINGS} 
        setSettings={handleSettingsChange}
        
        showInstallButton={showInstallButton}
        onInstall={handleInstallClick}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row h-full relative z-10">
        
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-gray-700 flex items-center px-4 bg-mc-panel z-10 flex-shrink-0 justify-between">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="text-gray-300 mr-3">
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-white truncate max-w-[200px]">{activeProject?.name || "MineGen AI"}</span>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 md:w-[40%] md:flex-none border-r border-gray-800 h-full overflow-hidden bg-mc-dark/50 backdrop-blur-sm">
          {activeProject && (
            <ChatInterface 
              key={activeProject.id} // Force re-mount on project switch
              settings={activeProject.settings} 
              messages={activeProject.messages}
              setMessages={handleMessagesUpdate}
              currentProject={activeProject.generatedProject}
              onProjectGenerated={handleProjectGenerated}
              onClearProject={() => updateActiveProject({ generatedProject: null, messages: [] })} // Soft reset
              onUpdateProjectName={(name) => updateActiveProject({ name })}
            />
          )}
        </div>

        {/* Code View Area */}
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