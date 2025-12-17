
import React, { useState } from 'react';
import { PluginSettings, Platform, JavaVersion, SavedProject } from '../types';
import { MC_VERSIONS } from '../constants';
import { Database, Coffee, Tag, Cpu, Download, MessageSquare, Plus, Trash2, Sliders } from 'lucide-react';

interface ConfigSidebarProps {
  settings: PluginSettings;
  setSettings: React.Dispatch<React.SetStateAction<PluginSettings>>;
  isOpen: boolean;
  toggleSidebar: () => void;
  showInstallButton?: boolean;
  onInstall?: () => void;

  // Project Management
  projects: SavedProject[];
  currentProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (id: string) => void;
}

const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ 
  settings, setSettings, isOpen, toggleSidebar, showInstallButton, onInstall,
  projects, currentProjectId, onSelectProject, onCreateProject, onDeleteProject
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'config'>('chats');

  const handleChange = (field: keyof PluginSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-80 bg-mc-panel border-r border-gray-700 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 overflow-y-auto flex flex-col`}>
      
      {/* Tab Header */}
      <div className="flex border-b border-gray-700">
        <button 
          onClick={() => setActiveTab('chats')}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'chats' ? 'text-white border-b-2 border-mc-accent bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
        >
          <MessageSquare className="w-4 h-4" /> Projetos
        </button>
        <button 
           onClick={() => setActiveTab('config')}
           className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'config' ? 'text-white border-b-2 border-mc-accent bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}
        >
          <Sliders className="w-4 h-4" /> Config
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        
        {/* --- PROJECTS TAB --- */}
        {activeTab === 'chats' && (
          <div className="p-4 space-y-4">
             <button 
              onClick={onCreateProject}
              className="w-full bg-mc-accent hover:bg-blue-600 text-white rounded-lg py-2.5 px-4 text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 mb-4"
            >
              <Plus className="w-4 h-4" /> Novo Projeto
            </button>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-1">Seus Chats</label>
              {projects.map(project => (
                <div 
                  key={project.id}
                  className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all ${currentProjectId === project.id ? 'bg-gray-800 border-mc-accent shadow-md' : 'bg-transparent border-transparent hover:bg-gray-800/50 hover:border-gray-700'}`}
                  onClick={() => onSelectProject(project.id)}
                >
                   <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${currentProjectId === project.id ? 'bg-mc-accent/20 text-mc-accent' : 'bg-gray-700 text-gray-400'}`}>
                      <MessageSquare className="w-4 h-4" />
                   </div>
                   <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-medium truncate ${currentProjectId === project.id ? 'text-white' : 'text-gray-300'}`}>
                        {project.name}
                      </h4>
                      <p className="text-[10px] text-gray-500 truncate">
                        {new Date(project.lastModified).toLocaleDateString()} • {project.settings.platform}
                      </p>
                   </div>
                   
                   <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1.5 rounded transition-all"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>
              ))}
              
              {projects.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-xs">
                  Nenhum projeto salvo.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- CONFIG TAB --- */}
        {activeTab === 'config' && (
          <div className="p-4 space-y-6">
            
            {/* AI Config */}
            <div className="space-y-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
               <label className="text-xs font-semibold text-mc-gold uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3 h-3" /> API (OpenRouter)
              </label>
              <div>
                <span className="text-xs text-gray-400 mb-1 block">Modelo ID</span>
                 <input
                  type="text"
                  value={settings.aiModel}
                  onChange={(e) => handleChange('aiModel', e.target.value)}
                  placeholder="google/gemini-2.0-flash-001"
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs focus:border-mc-gold focus:outline-none text-white font-mono"
                />
              </div>
            </div>

            {/* Project Identity */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3" /> Identidade do Plugin
              </label>
              <div>
                <span className="text-xs text-gray-500 mb-1 block">Nome</span>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-gray-500 mb-1 block">Group ID</span>
                  <input
                    type="text"
                    value={settings.groupId}
                    onChange={(e) => handleChange('groupId', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-mc-accent focus:outline-none text-white"
                  />
                </div>
                <div>
                  <span className="text-xs text-gray-500 mb-1 block">Artifact ID</span>
                  <input
                    type="text"
                    value={settings.artifactId}
                    onChange={(e) => handleChange('artifactId', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-mc-accent focus:outline-none text-white"
                  />
                </div>
              </div>
            </div>

            {/* Environment */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Database className="w-3 h-3" /> Ambiente
              </label>
              
              <div>
                <span className="text-xs text-gray-500 mb-1 block">Plataforma</span>
                <select
                  value={settings.platform}
                  onChange={(e) => handleChange('platform', e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
                >
                  {Object.values(Platform).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-xs text-gray-500 mb-1 block">Versão do MC</span>
                <select
                  value={settings.mcVersion}
                  onChange={(e) => handleChange('mcVersion', e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
                >
                  {MC_VERSIONS.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-xs text-gray-500 mb-1 block">Versão do Java</span>
                <select
                  value={settings.javaVersion}
                  onChange={(e) => handleChange('javaVersion', e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
                >
                  {Object.entries(JavaVersion).map(([key, val]) => (
                    <option key={key} value={val}>Java {val}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Metadata */}
            <div className="space-y-3">
               <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Coffee className="w-3 h-3" /> Metadados
              </label>
              <div>
                <span className="text-xs text-gray-500 mb-1 block">Descrição</span>
                <textarea
                  value={settings.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white resize-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Area */}
      <div className="p-4 border-t border-gray-700 flex flex-col gap-3">
        {showInstallButton && onInstall && (
          <button 
            onClick={onInstall}
            className="w-full bg-mc-green/20 hover:bg-mc-green/30 text-mc-green border border-mc-green/50 rounded-lg py-2 px-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all animate-pulse"
          >
            <Download className="w-4 h-4" /> Instalar App
          </button>
        )}
        <p className="text-xs text-gray-500 text-center">MineGen AI v2.1 (OpenRouter)</p>
      </div>
    </div>
  );
};

export default ConfigSidebar;
