
import React, { useState } from 'react';
import { PluginSettings, Platform, JavaVersion } from '../types';
import { MC_VERSIONS } from '../constants';
import { Settings, Box, Database, Coffee, Tag, Cpu, Download, Github, Check, AlertCircle, Loader2 } from 'lucide-react';
import { validateGitHubToken, createGitHubRepository } from '../services/githubService';

interface ConfigSidebarProps {
  settings: PluginSettings;
  setSettings: React.Dispatch<React.SetStateAction<PluginSettings>>;
  isOpen: boolean;
  toggleSidebar: () => void;
  showInstallButton?: boolean;
  onInstall?: () => void;
}

const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ settings, setSettings, isOpen, toggleSidebar, showInstallButton, onInstall }) => {
  const [ghLoading, setGhLoading] = useState(false);
  const [ghError, setGhError] = useState('');
  
  // Local state for inputs before saving to global settings
  const [tokenInput, setTokenInput] = useState(settings.github?.token || '');
  const [repoInput, setRepoInput] = useState(settings.github?.repoName || settings.artifactId);

  const handleChange = (field: keyof PluginSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleConnectGitHub = async () => {
    setGhLoading(true);
    setGhError('');
    try {
      const username = await validateGitHubToken(tokenInput);
      
      setSettings(prev => ({
        ...prev,
        github: {
          token: tokenInput,
          username: username,
          repoName: repoInput,
          isConnected: true
        }
      }));
    } catch (e: any) {
      setGhError(e.message);
    } finally {
      setGhLoading(false);
    }
  };

  const handleCreateRepo = async () => {
    if (!settings.github?.isConnected) return;
    setGhLoading(true);
    setGhError('');
    try {
      await createGitHubRepository(settings.github.token, settings.github.repoName, settings.description);
      alert(`Repositório '${settings.github.repoName}' criado/verificado com sucesso!`);
    } catch (e: any) {
      setGhError(e.message);
    } finally {
      setGhLoading(false);
    }
  };

  const handleDisconnect = () => {
    setSettings(prev => ({
      ...prev,
      github: undefined
    }));
    setTokenInput('');
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-mc-panel border-r border-gray-700 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 overflow-y-auto flex flex-col`}>
      <div className="p-4 border-b border-gray-700 flex items-center gap-2 flex-shrink-0">
        <Settings className="w-5 h-5 text-mc-accent" />
        <h2 className="font-bold text-lg text-white">Configurações</h2>
      </div>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto">
        
        {/* GitHub Integration (Priority) */}
        <div className="space-y-3 bg-gray-800/80 p-3 rounded-lg border border-gray-600 shadow-lg">
           <label className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1">
            <Github className="w-3 h-3" /> Integração GitHub
          </label>
          
          {!settings.github?.isConnected ? (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-400 leading-tight">
                Para compilar na nuvem, você precisa conectar sua conta do GitHub usando um "Personal Access Token" (Classic) com permissões <b>repo</b> e <b>workflow</b>.
              </p>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ghp_..."
                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-white focus:border-mc-accent focus:outline-none"
              />
               <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Nome do Repositório"
                className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-white focus:border-mc-accent focus:outline-none"
              />
              <button 
                onClick={handleConnectGitHub}
                disabled={ghLoading || !tokenInput}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white rounded p-1.5 text-xs font-bold transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {ghLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : "Conectar GitHub"}
              </button>
              {ghError && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {ghError}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-green-900/20 border border-green-800 rounded p-2">
                <div className="flex items-center gap-2">
                   <img src={`https://github.com/${settings.github.username}.png`} className="w-6 h-6 rounded-full" alt="" />
                   <div className="flex flex-col">
                      <span className="text-xs font-bold text-green-400">Conectado</span>
                      <span className="text-[10px] text-gray-400">@{settings.github.username}</span>
                   </div>
                </div>
                <button onClick={handleDisconnect} className="text-[10px] text-red-400 underline">Sair</button>
              </div>

              <div className="bg-gray-900/50 p-2 rounded border border-gray-700">
                <span className="text-[10px] text-gray-500 block mb-1">Repositório Alvo</span>
                <div className="text-xs font-mono text-white truncate">{settings.github.repoName}</div>
              </div>

              <button 
                onClick={handleCreateRepo}
                disabled={ghLoading}
                className="w-full bg-mc-accent hover:bg-blue-600 text-white rounded p-1.5 text-xs font-bold transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {ghLoading ? <Loader2 className="w-3 h-3 animate-spin"/> : "Criar/Verificar Repo"}
              </button>
               {ghError && <p className="text-[10px] text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {ghError}</p>}
            </div>
          )}
        </div>

        {/* AI Configuration */}
        <div className="space-y-3 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
           <label className="text-xs font-semibold text-mc-gold uppercase tracking-wider flex items-center gap-1">
            <Cpu className="w-3 h-3" /> Configuração da IA
          </label>
          <div>
            <span className="text-xs text-gray-400 mb-1 block">Modelo de IA</span>
             <input
              type="text"
              value={settings.aiModel}
              onChange={(e) => handleChange('aiModel', e.target.value)}
              placeholder="google/gemini-2.0-flash-001"
              className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs focus:border-mc-gold focus:outline-none text-white"
            />
          </div>
        </div>

        {/* Identity */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Tag className="w-3 h-3" /> Identidade
          </label>
          <div>
            <span className="text-xs text-gray-500 mb-1 block">Nome do Projeto</span>
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
        <p className="text-xs text-gray-500 text-center">MineGen AI v1.0.0</p>
      </div>
    </div>
  );
};

export default ConfigSidebar;
