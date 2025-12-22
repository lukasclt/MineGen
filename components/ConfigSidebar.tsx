
import React, { useState } from 'react';
import { PluginSettings, Platform, JavaVersion, SavedProject, BuildSystem, User } from '../types';
import { MC_VERSIONS, OPENROUTER_MODELS } from '../constants';
import { Database, Coffee, Tag, Cpu, Download, MessageSquare, Plus, Trash2, Sliders, Box, Volume2, Mic, FolderOpen, Globe, Key, Zap, Rocket, Users, UserPlus, Shield, LogOut, ChevronRight, Settings2, UserX, Loader2, AlertCircle, Link, Check, Copy } from 'lucide-react';
import { dbService } from '../services/dbService';
import { playSound } from '../services/audioService';

interface ConfigSidebarProps {
  settings: PluginSettings;
  setSettings: React.Dispatch<React.SetStateAction<PluginSettings>>;
  isOpen: boolean;
  toggleSidebar: () => void;
  showInstallButton?: boolean;
  onInstall?: () => void;

  // Auth
  currentUser: User | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  onDeleteAccount?: () => void;

  // Project Management
  projects: SavedProject[];
  currentProjectId: string | null;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void; 
  onDeleteProject: (id: string) => void;
  onInviteMember: (email: string) => void; 
}

const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ 
  settings, setSettings, isOpen, toggleSidebar, showInstallButton, onInstall,
  projects, currentProjectId, onSelectProject, onCreateProject, onDeleteProject,
  currentUser, onOpenLogin, onLogout, onInviteMember, onDeleteAccount
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'config' | 'members'>('chats');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const handleChange = (field: keyof PluginSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const isConfigDisabled = !currentProjectId;
  const activeProject = projects.find(p => p.id === currentProjectId);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !currentUser || !activeProject) return;

    setIsInviting(true);
    setInviteError(null);

    try {
      await dbService.sendInvite(
        activeProject.id,
        activeProject.name,
        currentUser.id,
        currentUser.username,
        inviteEmail
      );
      playSound('success');
      onInviteMember(inviteEmail); 
      setInviteEmail('');
      alert(`Convite enviado para ${inviteEmail}!`);
    } catch (err: any) {
      playSound('error');
      setInviteError(err.message || "Erro ao enviar convite.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!currentUser || !activeProject) return;
    setIsInviting(true);
    try {
        const token = await dbService.createInviteLink(activeProject.id, currentUser.id);
        const url = `${window.location.origin}?invite=${token}`;
        setGeneratedLink(url);
        playSound('success');
    } catch (e: any) {
        setInviteError(e.message || "Erro ao gerar link");
        playSound('error');
    } finally {
        setIsInviting(false);
    }
  };

  const copyLink = () => {
      navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      playSound('click');
      setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-80 bg-mc-panel border-r border-gray-700 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 overflow-y-auto flex flex-col`}>
      
      {/* User Header Section */}
      <div className="p-4 border-b border-gray-700 bg-black/10">
        {currentUser ? (
          <div className="space-y-3">
             <div className="flex items-center gap-3">
              <button onClick={onOpenLogin} className="relative group shrink-0">
                <div className="w-10 h-10 rounded-full bg-mc-accent flex items-center justify-center text-white font-bold text-lg shadow-inner group-hover:ring-2 ring-mc-accent transition-all">
                  {currentUser.username[0].toUpperCase()}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-mc-gold rounded-full p-0.5 border border-mc-panel">
                  <Settings2 className="w-3 h-3 text-mc-dark" />
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white truncate">{currentUser.username}</h4>
                <p className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                  {currentUser.savedApiKey ? <Shield className="w-2.5 h-2.5 text-mc-green" /> : <Key className="w-2.5 h-2.5 text-gray-500" />}
                  {currentUser.savedApiKey ? 'Chave Ativa' : 'Sem Chave de API'}
                </p>
              </div>
              <button onClick={onLogout} className="p-2 text-gray-500 hover:text-red-400 transition-colors" title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            
            {onDeleteAccount && (
              <div className="text-[10px] flex justify-end">
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2 bg-red-900/30 p-1 rounded border border-red-500/30">
                     <span className="text-red-300">Tem certeza?</span>
                     <button onClick={() => { onDeleteAccount(); setShowDeleteConfirm(false); }} className="text-white bg-red-600 px-2 rounded hover:bg-red-500">Sim</button>
                     <button onClick={() => setShowDeleteConfirm(false)} className="text-gray-300 hover:text-white">Cancelar</button>
                  </div>
                ) : (
                   <button onClick={() => setShowDeleteConfirm(true)} className="text-gray-600 hover:text-red-500 flex items-center gap-1 transition-colors">
                      <UserX className="w-3 h-3" /> Deletar Conta
                   </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <button 
            onClick={onOpenLogin}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-600 text-xs font-bold transition-all"
          >
            <Shield className="w-4 h-4 text-mc-gold" /> Acessar Conta
          </button>
        )}
      </div>

      {/* Tab Header */}
      <div className="flex border-b border-gray-700 bg-mc-dark/30">
        <button onClick={() => setActiveTab('chats')} className={`flex-1 py-3 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'chats' ? 'text-white border-b-2 border-mc-accent bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
          <MessageSquare className="w-3.5 h-3.5" /> PROJETOS
        </button>
        <button onClick={() => setActiveTab('members')} className={`flex-1 py-3 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'members' ? 'text-white border-b-2 border-mc-green bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
          <Users className="w-3.5 h-3.5" /> MEMBROS
        </button>
        <button onClick={() => setActiveTab('config')} className={`flex-1 py-3 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ${activeTab === 'config' ? 'text-white border-b-2 border-mc-gold bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'}`}>
          <Sliders className="w-3.5 h-3.5" /> CONFIG
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        
        {activeTab === 'chats' && (
          <div className="p-4 space-y-4">
             <div className="flex gap-2">
               <button onClick={onCreateProject} className="flex-1 bg-mc-accent hover:bg-blue-600 text-white rounded-lg py-2 px-3 text-xs font-bold transition-all flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Novo</button>
               <button onClick={onCreateProject} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 px-3 text-xs font-bold transition-all flex items-center justify-center gap-2 border border-gray-600"><FolderOpen className="w-4 h-4" /> Abrir</button>
             </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Seus Plugins</label>
              {projects.map(project => (
                <div key={project.id} className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all ${currentProjectId === project.id ? 'bg-gray-800 border-mc-accent shadow-md' : 'bg-transparent border-transparent hover:bg-gray-800/50 hover:border-gray-700'}`} onClick={() => onSelectProject(project.id)}>
                   <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${currentProjectId === project.id ? 'bg-mc-accent/20 text-mc-accent' : 'bg-gray-700 text-gray-400'}`}><Box className="w-4 h-4" /></div>
                   <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-bold truncate ${currentProjectId === project.id ? 'text-white' : 'text-gray-300'}`}>{project.name}</h4>
                      <p className="text-[10px] text-gray-500">{project.settings.platform} • {new Date(project.lastModified).toLocaleDateString()}</p>
                   </div>
                   <button onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }} className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1 rounded transition-all"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="p-4 space-y-6">
            <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-700">
               <label className="text-xs font-bold text-white mb-3 block flex items-center gap-2"><UserPlus className="w-4 h-4 text-mc-green" /> Convidar Colaborador</label>
               <form onSubmit={handleInviteSubmit} className="space-y-2">
                  <input
                    type="email"
                    placeholder="e-mail do usuário..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={isConfigDisabled || isInviting}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-xs text-white outline-none focus:border-mc-green disabled:opacity-50"
                  />
                  {inviteError && (
                    <div className="flex items-center gap-2 text-[10px] text-red-400 bg-red-900/20 p-2 rounded border border-red-500/30">
                       <AlertCircle className="w-3 h-3 shrink-0" />
                       {inviteError}
                    </div>
                  )}
                  <button type="submit" disabled={isConfigDisabled || !inviteEmail || isInviting} className="w-full bg-mc-green hover:bg-green-600 disabled:opacity-50 text-mc-dark font-bold text-xs py-2 rounded transition-all flex items-center justify-center gap-2">
                    {isInviting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    {isInviting ? "Verificando..." : "Enviar Convite"}
                  </button>
               </form>
               
               <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-700"></div>
                  <span className="flex-shrink-0 mx-2 text-[10px] text-gray-500">OU</span>
                  <div className="flex-grow border-t border-gray-700"></div>
               </div>

               <div className="space-y-2">
                 {generatedLink ? (
                   <div className="bg-black/40 rounded border border-gray-600 p-2 flex items-center gap-2">
                     <div className="flex-1 truncate text-[10px] text-mc-accent font-mono">{generatedLink}</div>
                     <button onClick={copyLink} className="text-gray-400 hover:text-white">
                        {linkCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                     </button>
                   </div>
                 ) : (
                   <button 
                     onClick={handleGenerateLink} 
                     disabled={isConfigDisabled}
                     className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-bold text-xs py-2 rounded transition-all flex items-center justify-center gap-2"
                   >
                     <Link className="w-3.5 h-3.5" /> Gerar Link de Convite
                   </button>
                 )}
               </div>
            </div>

            <div className="space-y-3">
               <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                 Participantes ({(activeProject?.members || []).length})
               </label>
               {activeProject ? (
                 <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2.5 bg-mc-accent/10 border border-mc-accent/20 rounded-lg">
                       <div className="w-8 h-8 rounded-full bg-mc-accent flex items-center justify-center text-[10px] font-bold text-white">Owner</div>
                       <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white">Dono do Projeto</p>
                          <p className="text-[9px] text-mc-accent uppercase">Administrador</p>
                       </div>
                       <Shield className="w-3.5 h-3.5 text-mc-gold" />
                    </div>
                    {(activeProject.members || []).map((memberEmail, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-800/40 border border-gray-700 rounded-lg group">
                        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                          {memberEmail && memberEmail.length > 0 ? memberEmail[0].toUpperCase() : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-xs font-medium text-gray-300 truncate">{memberEmail}</p>
                           <p className="text-[9px] text-gray-500 uppercase">Editor</p>
                        </div>
                        <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                 </div>
               ) : (
                 <p className="text-[10px] text-gray-600 italic text-center py-4">Selecione um projeto para ver os membros.</p>
               )}
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="p-4 space-y-6">
            {!currentProjectId && (
               <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 p-3 rounded text-[10px] mb-2">Selecione um projeto para editar as configurações.</div>
            )}
            
            <div className="space-y-4 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
               <label className="text-xs font-bold text-mc-gold uppercase tracking-wider flex items-center gap-1"><Cpu className="w-3.5 h-3.5" /> IA (OpenRouter)</label>
               
               <div>
                  <span className="text-[10px] text-gray-500 mb-1 block uppercase font-bold">Modelo de Inteligência</span>
                  <select 
                    value={settings.aiModel || 'google/gemini-2.0-flash-001'} 
                    onChange={(e) => handleChange('aiModel', e.target.value)} 
                    disabled={isConfigDisabled} 
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-xs text-mc-green font-mono outline-none cursor-pointer hover:border-mc-gold transition-colors"
                  >
                    {OPENROUTER_MODELS.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
               </div>

               <div className="text-[9px] text-gray-400 bg-black/40 p-2 rounded border border-gray-800 leading-relaxed">
                  <Rocket className="w-2.5 h-2.5 inline mr-1 text-mc-gold" />
                  <strong>Dica:</strong> Modelos "Pro" ou "Sonnet" são melhores para lógica complexa. Modelos "Flash" são mais rápidos e baratos.
               </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Identidade do Plugin</label>
              <input type="text" value={settings.name || ''} onChange={(e) => handleChange('name', e.target.value)} disabled={isConfigDisabled} className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-sm text-white outline-none focus:border-mc-accent" placeholder="Nome do Plugin" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={settings.groupId || ''} onChange={(e) => handleChange('groupId', e.target.value)} disabled={isConfigDisabled} className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-xs text-white outline-none" placeholder="groupId" />
                <input type="text" value={settings.artifactId || ''} onChange={(e) => handleChange('artifactId', e.target.value)} disabled={isConfigDisabled} className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-xs text-white outline-none" placeholder="artifactId" />
              </div>
            </div>
            
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1"><Rocket className="w-3.5 h-3.5" /> Plataforma</label>
              <select 
                value={settings.platform} 
                onChange={(e) => handleChange('platform', e.target.value)} 
                disabled={isConfigDisabled}
                className="w-full bg-gray-900 border border-gray-700 rounded p-2.5 text-xs text-white outline-none cursor-pointer"
              >
                {Object.values(Platform).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-gray-700 flex flex-col gap-3">
        {showInstallButton && onInstall && (
          <button onClick={onInstall} className="w-full bg-mc-green/20 hover:bg-mc-green/30 text-mc-green border border-mc-green/50 rounded-lg py-2 px-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all animate-pulse"><Download className="w-4 h-4" /> Instalar App</button>
        )}
        <p className="text-[10px] text-gray-600 text-center font-mono">MineGen OpenRouter v4.1</p>
      </div>
    </div>
  );
};

export default ConfigSidebar;
