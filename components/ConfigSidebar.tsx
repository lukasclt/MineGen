
import React, { useState } from 'react';
import { PluginSettings, Platform, JavaVersion, GitHubRepo, BuildSystem, User, AIProvider } from '../types';
import { MC_VERSIONS, GITHUB_COPILOT_MODELS } from '../constants';
import { GitBranch, Plus, Trash2, Sliders, Box, LogOut, Settings2, FolderGit2, Loader2, RefreshCw, Cpu, Github, Globe } from 'lucide-react';

interface ConfigSidebarProps {
  settings: PluginSettings;
  setSettings: React.Dispatch<React.SetStateAction<PluginSettings>>;
  isOpen: boolean;
  toggleSidebar: () => void;

  currentUser: User | null;
  onLogout: () => void;

  repos: GitHubRepo[];
  currentRepoId: number | null;
  onSelectRepo: (repo: GitHubRepo) => void;
  onCreateRepo: () => void;
  onRefreshRepos: () => void;
  isLoadingRepos: boolean;
}

const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ 
  settings, setSettings, isOpen, toggleSidebar,
  currentUser, onLogout,
  repos, currentRepoId, onSelectRepo, onCreateRepo, onRefreshRepos, isLoadingRepos
}) => {
  const [activeTab, setActiveTab] = useState<'repos' | 'config'>('repos');

  const handleChange = (field: keyof PluginSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const isConfigDisabled = !currentRepoId;

  // Lista de Modelos sempre do GitHub Copilot
  const currentModelList = GITHUB_COPILOT_MODELS;

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-80 bg-[#1e1e1e] border-r border-[#333] transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 overflow-y-auto flex flex-col`}>
      
      {/* User Header */}
      <div className="p-4 border-b border-[#333] bg-[#252526]">
        {currentUser ? (
          <div className="flex items-center gap-3">
             <img src={currentUser.avatarUrl} alt={currentUser.username} className="w-10 h-10 rounded-full border border-gray-600" />
             <div className="flex-1 min-w-0">
               <h4 className="text-sm font-bold text-white truncate">{currentUser.username}</h4>
               <p className="text-[10px] text-gray-500">GitHub Connected</p>
             </div>
             <button onClick={onLogout} className="p-2 text-gray-500 hover:text-red-400" title="Sair"><LogOut className="w-4 h-4" /></button>
          </div>
        ) : null}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#333] bg-[#1e1e1e]">
        <button onClick={() => setActiveTab('repos')} className={`flex-1 py-3 text-[11px] font-bold flex items-center justify-center gap-1.5 ${activeTab === 'repos' ? 'text-white border-b-2 border-mc-accent' : 'text-gray-500'}`}>
          <GitBranch className="w-3.5 h-3.5" /> REPOSITÓRIOS
        </button>
        <button onClick={() => setActiveTab('config')} className={`flex-1 py-3 text-[11px] font-bold flex items-center justify-center gap-1.5 ${activeTab === 'config' ? 'text-white border-b-2 border-mc-gold' : 'text-gray-500'}`}>
          <Sliders className="w-3.5 h-3.5" /> CONFIG
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'repos' && (
          <div className="p-4 space-y-4">
             <div className="flex gap-2">
                <button onClick={onCreateRepo} className="flex-1 bg-mc-green text-black rounded-md py-2 text-xs font-bold hover:bg-green-500 transition-all flex items-center justify-center gap-1">
                    <Plus className="w-3 h-3" /> Criar Repo
                </button>
                <button onClick={onRefreshRepos} className="px-3 bg-gray-700 text-white rounded-md hover:bg-gray-600" title="Atualizar Lista">
                    <RefreshCw className={`w-3 h-3 ${isLoadingRepos ? 'animate-spin' : ''}`} />
                </button>
             </div>

             <div className="space-y-1">
                {repos.map(repo => (
                    <div 
                        key={repo.id} 
                        onClick={() => onSelectRepo(repo)}
                        className={`group p-3 rounded-md cursor-pointer border flex items-center gap-3 transition-all ${currentRepoId === repo.id ? 'bg-[#37373d] border-mc-accent' : 'bg-transparent border-transparent hover:bg-[#2a2d2e]'}`}
                    >
                        <FolderGit2 className={`w-4 h-4 ${currentRepoId === repo.id ? 'text-mc-accent' : 'text-gray-500'}`} />
                        <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-medium truncate ${currentRepoId === repo.id ? 'text-white' : 'text-gray-400'}`}>{repo.name}</h4>
                            <p className="text-[10px] text-gray-600 truncate">{new Date(repo.updated_at).toLocaleDateString()}</p>
                        </div>
                    </div>
                ))}
                {repos.length === 0 && !isLoadingRepos && (
                    <p className="text-center text-xs text-gray-500 py-4">Nenhum repositório encontrado.</p>
                )}
             </div>
          </div>
        )}

        {activeTab === 'config' && (
           <div className="p-4 space-y-6">
                
                <div className="space-y-4 bg-[#252526] p-3 rounded-md border border-[#333]">
                   <label className="text-xs font-bold text-gray-400 uppercase">Modelo de IA (GitHub Models)</label>
                   <select 
                     value={settings.aiModel} 
                     onChange={(e) => handleChange('aiModel', e.target.value)} 
                     className="w-full bg-[#1e1e1e] border border-[#333] rounded p-2 text-xs text-white outline-none"
                   >
                     {currentModelList.map(model => (
                       <option key={model.id} value={model.id}>{model.name}</option>
                     ))}
                   </select>
                   <p className="text-[10px] text-green-400 mt-1">
                       Usando sua conta GitHub conectada (GitHub Models).
                   </p>
                </div>

                <div className="space-y-4 bg-[#252526] p-3 rounded-md border border-[#333]">
                   <label className="text-xs font-bold text-gray-400 uppercase">Java Version (Build)</label>
                   <select 
                     value={settings.javaVersion} 
                     onChange={(e) => handleChange('javaVersion', e.target.value)} 
                     className="w-full bg-[#1e1e1e] border border-[#333] rounded p-2 text-xs text-white outline-none"
                     disabled={isConfigDisabled}
                   >
                     {Object.values(JavaVersion).map(v => (
                       <option key={v} value={v}>Java {v}</option>
                     ))}
                   </select>
                   <p className="text-[10px] text-gray-500">
                      Isso configura o toolchain do Gradle e o GitHub Actions.
                   </p>
                </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default ConfigSidebar;
