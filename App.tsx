import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import ConfigSidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import { PluginSettings, GeneratedProject } from './types';
import { DEFAULT_SETTINGS } from './constants';

const App: React.FC = () => {
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [currentProject, setCurrentProject] = useState<GeneratedProject | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="flex h-screen w-full bg-mc-dark text-white overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Settings */}
      <ConfigSidebar 
        settings={settings} 
        setSettings={setSettings} 
        isOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row h-full relative">
        
        {/* Mobile Header */}
        <div className="md:hidden h-14 border-b border-gray-700 flex items-center px-4 bg-mc-panel z-10 flex-shrink-0">
          <button onClick={toggleSidebar} className="text-gray-300">
            <Menu className="w-6 h-6" />
          </button>
          <span className="ml-3 font-bold text-white">MineGen AI</span>
        </div>

        {/* Chat Area - 40% width on desktop */}
        <div className="flex-1 md:w-[40%] md:flex-none border-r border-gray-800 h-full overflow-hidden">
          <ChatInterface 
            settings={settings} 
            onProjectGenerated={(proj) => setCurrentProject(proj)} 
          />
        </div>

        {/* Code View Area - 60% width on desktop */}
        <div className="hidden md:flex flex-1 md:w-[60%] h-full overflow-hidden">
          <CodeViewer 
            project={currentProject} 
            settings={settings}
            onProjectUpdate={(newProj) => setCurrentProject(newProj)}
          />
        </div>
        
        {/* Mobile View Toggle */}
      </div>
    </div>
  );
};

export default App;