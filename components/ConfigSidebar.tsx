
import React, { useState } from 'react';
import { PluginSettings, Platform, JavaVersion, SavedProject, BuildSystem } from '../types';
import { MC_VERSIONS } from '../constants';
import { Database, Coffee, Tag, Cpu, Download, MessageSquare, Plus, Trash2, Sliders, Box, Volume2, Mic, FolderOpen, Globe } from 'lucide-react';

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
  onCreateProject: () => void; // Used for "Open"/New in file system
  onDeleteProject: (id: string) => void;
}

const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ 
  settings, setSettings, isOpen, toggleSidebar, showInstallButton, onInstall,
  projects, currentProjectId, onSelectProject, onCreateProject, onDeleteProject
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'config'>('chats');

  const handleChange = (field: keyof PluginSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const isConfigDisabled = !currentProjectId;

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
             
             <div className="flex gap-2 mb-4">
               <button 
                onClick={onCreateProject}
                className="flex-1 bg-mc-accent hover:bg-blue-600 text-white rounded-lg py-2.5 px-3 text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Novo
              </button>
              
              <button 
                onClick={onCreateProject}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 px-3 text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 border border-gray-600"
              >
                <FolderOpen className="w-4 h-4" /> Abrir
              </button>
             </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-1">Histórico</label>
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
                  Nenhum projeto aberto.
                  <br/>
                  Crie ou abra uma pasta para começar.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- CONFIG TAB --- */}
        {activeTab === 'config' && (
          <div className="p-4 space-y-6">
            {!currentProjectId && (
               <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 p-3 rounded text-xs mb-2">
                 Selecione um projeto para editar as configurações.
               </div>
            )}
            
            {/* Audio Settings */}
            <div className="space-y-3 bg-gray-800/30 p-3 rounded-lg border border-gray-700/50">
               <label className="text-xs font-semibold text-mc-accent uppercase tracking-wider flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> Áudio & Voz
              </label>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Efeitos Sonoros</span>
                <button 
                   onClick={() => handleChange('enableSounds', !settings.enableSounds)}
                   disabled={isConfigDisabled}
                   className={`w-10 h-5 rounded-full relative transition-colors ${settings.enableSounds ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50`}
                >
                   <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.enableSounds ? 'left-6' : 'left-1'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-sm text-gray-300 flex items-center gap-1">Leitura Automática <Mic className="w-3 h-3 text-gray-500" /></span>
                    <span className="text-[10px] text-gray-500">Lê respostas da IA (sem código)</span>
                </div>
                <button 
                   onClick={() => handleChange('enableTTS', !settings.enableTTS)}
                   disabled={isConfigDisabled}
                   className={`w-10 h-5 rounded-full relative transition-colors ${settings.enableTTS ? 'bg-green-500' : 'bg-gray-600'} disabled:opacity-50`}
                >
                   <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.enableTTS ? 'left-6' : 'left-1'}`}></div>
                </button>
              </div>
            </div>

            {/* AI Config */}
            <div className="space-y-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
               <label className="text-xs font-semibold text-mc-gold uppercase tracking-wider flex items-center gap-1">
                <Cpu className="w-3 h-3" /> API Provider
              </label>
              
              <div>
                <span className="text-xs text-gray-400 mb-1 block flex items-center gap-1"><Globe className="w-3 h-3" /> API Base URL</span>
                 <input
                  type="text"
                  value={settings.aiUrl || ''}
                  onChange={(e) => handleChange('aiUrl', e.target.value)}
                  disabled={isConfigDisabled}
                  placeholder="https://openrouter.ai/api/v1"
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs focus:border-mc-gold focus:outline-none text-white font-mono disabled:opacity-50 mb-2"
                />
              </div>

              <div>
                <span className="text-xs text-gray-400 mb-1 block">Modelo ID</span>
                 <input
                  type="text"
                  value={settings.aiModel || ''}
                  onChange={(e) => handleChange('aiModel', e.target.value)}
                  disabled={isConfigDisabled}
                  placeholder="gpt-oss-120b"
                  className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs focus:border-mc-gold focus:outline-none text-white font-mono disabled:opacity-50"
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
                  value={settings.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  disabled={isConfigDisabled}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-gray-500 mb-1 block">Group ID</span>
                  <input
                    type="text"
                    value={settings.groupId || ''}
                    onChange={(e) => handleChange('groupId', e.target.value)}
                    disabled={isConfigDisabled}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
                  />
                </div>
                <div>
                  <span className="text-xs text-gray-500 mb-1 block">Artifact ID</span>
                  <input
                    type="text"
                    value={settings.artifactId || ''}
                    onChange={(e) => handleChange('artifactId', e.target.value)}
                    disabled={isConfigDisabled}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
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
                  disabled={isConfigDisabled}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
                >
                  {Object.values(Platform).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

               {/* BUILD SYSTEM */}
               <div>
                <span className="text-xs text-gray-500 mb-1 block flex items-center gap-1"><Box className="w-3 h-3" /> Sistema de Build</span>
                <select
                  value={settings.buildSystem}
                  onChange={(e) => handleChange('buildSystem', e.target.value)}
                  disabled={isConfigDisabled}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
                >
                  {Object.values(BuildSystem).map(sys => (
                    <option key={sys} value={sys}>{sys}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-xs text-gray-500 mb-1 block">Versão do MC</span>
                <select
                  value={settings.mcVersion}
                  onChange={(e) => handleChange('mcVersion', e.target.value)}
                  disabled={isConfigDisabled}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
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
                  disabled={isConfigDisabled}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white disabled:opacity-50"
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
                  value={settings.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  disabled={isConfigDisabled}
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white resize-none disabled:opacity-50"
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
        <p className="text-xs text-gray-500 text-center">MineGen AI v2.3 (Multi-Provider)</p>
      </div>
    </div>
  );
};

export default ConfigSidebar;
