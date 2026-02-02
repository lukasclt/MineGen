
import React, { useState, useEffect, useRef } from 'react';
import { PluginSettings, GeneratedProject, ChatMessage, User, GitHubRepo, GeneratedFile, AIProvider, UsageStats } from './types';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import AuthModal from './components/AuthModal';
import { DEFAULT_SETTINGS, getGithubWorkflowYml } from './constants';
import { getUserRepos, createRepository, getRepoFiles, getLatestWorkflowRun, getWorkflowRunLogs, commitToRepo, triggerWorkflow, downloadReleaseJar } from './services/githubService';
import { playSound, speakText } from './services/audioService';
import { generatePluginCode } from './services/geminiService';
import { Loader2, Hammer, BrainCircuit, Clock, ChevronDown, ExternalLink, X, Download } from 'lucide-react';

const ESTIMATED_BUILD_TIME = 60;

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(true);
  
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [currentRepo, setCurrentRepo] = useState<GitHubRepo | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  
  const [projectData, setProjectData] = useState<GeneratedProject | null>(null);
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  
  const [isBuilding, setIsBuilding] = useState(false);
  const [showBuildOverlay, setShowBuildOverlay] = useState(false); 
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  const [buildTimeElapsed, setBuildTimeElapsed] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);

  const [usageStats, setUsageStats] = useState<UsageStats>(() => {
    const saved = localStorage.getItem('minegen_usage');
    return saved ? JSON.parse(saved) : { used: 0, limit: 50, resetDate: 'Verificando...' };
  });

  useEffect(() => {
    localStorage.setItem('minegen_usage', JSON.stringify(usageStats));
  }, [usageStats]);

  const updateUsage = (newUsage: UsageStats) => {
    setUsageStats(newUsage);
  };

  const addLog = (msg: string) => setTerminalLogs(prev => [...prev, msg]);

  useEffect(() => {
     const savedUser = localStorage.getItem('minegen_user_github');
     if (savedUser) {
         setCurrentUser(JSON.parse(savedUser));
         setIsAuthOpen(false);
     }
  }, []);

  useEffect(() => {
     if (currentUser && !currentRepo) {
        const savedRepo = localStorage.getItem(`minegen_last_repo_${currentUser.id}`);
        if (savedRepo) {
             const repo = JSON.parse(savedRepo);
             setCurrentRepo(repo);
             handleSelectRepo(repo, true);
        }
     }
  }, [currentUser]);

  useEffect(() => {
     if (currentUser) {
         localStorage.setItem('minegen_user_github', JSON.stringify(currentUser));
         refreshRepos();
     } else {
         localStorage.removeItem('minegen_user_github');
     }
  }, [currentUser]);

  useEffect(() => {
      if (currentUser && currentRepo) {
          localStorage.setItem(`minegen_last_repo_${currentUser.id}`, JSON.stringify(currentRepo));
          localStorage.setItem(`minegen_chat_${currentRepo.id}`, JSON.stringify(messages));
          localStorage.setItem(`minegen_settings_${currentRepo.id}`, JSON.stringify(settings));
      }
  }, [currentRepo, messages, currentUser, settings]);

  const refreshRepos = async () => {
      if (!currentUser) return;
      setIsLoadingRepos(true);
      try {
          const data = await getUserRepos(currentUser.githubToken);
          setRepos(data);
      } catch (e) {
          addLog(`Erro ao buscar repos: ${e}`);
      } finally {
          setIsLoadingRepos(false);
      }
  };

  const handleCreateRepo = async () => {
      const name = prompt("Nome do Repositório (sem espaços):");
      if (!name || !currentUser) return;

      const isPublic = window.confirm(
          "O repositório deve ser PÚBLICO?\n\n[OK] para Público\n[Cancelar] para Privado"
      );
      const isPrivate = !isPublic;
      
      try {
          addLog(`Criando repositório ${isPrivate ? 'Privado' : 'Público'} no GitHub...`);
          const newRepo = await createRepository(currentUser.githubToken, name, "Projeto MineGen AI", isPrivate);
          setRepos(prev => [newRepo, ...prev]);
          setCurrentRepo(newRepo);
          setMessages([]);

          // Atualiza as settings com a preferência de privacidade
          setSettings(prev => ({...prev, isPrivate: isPrivate}));
          
          addLog(`Inicializando estrutura Gradle com Java ${settings.javaVersion} e Auto-Release...`);
          const initialFiles: GeneratedFile[] = [
              { path: '.github/workflows/gradle.yml', content: getGithubWorkflowYml(settings.javaVersion), language: 'yaml' },
              { path: 'README.md', content: `# ${name}\n\nGerado por MineGen AI`, language: 'text' }
          ];
          
          await commitToRepo(currentUser.githubToken, currentUser.username, name, initialFiles, "Initial commit", "Project scaffold");
          setProjectData({ explanation: "Projeto Iniciado", commitTitle: "Init", commitDescription: "", files: initialFiles });
          playSound('success');

      } catch (e: any) {
          alert("Erro: " + e.message);
      }
  };

  const handleSelectRepo = async (repo: GitHubRepo, isAutoLoad = false) => {
      setIsRepoLoading(true);
      setCurrentRepo(repo);
      
      const savedChat = localStorage.getItem(`minegen_chat_${repo.id}`);
      if (savedChat) setMessages(JSON.parse(savedChat));
      else if (!isAutoLoad) setMessages([]);

      const savedSettings = localStorage.getItem(`minegen_settings_${repo.id}`);
      if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          parsed.aiProvider = AIProvider.GITHUB_COPILOT;
          parsed.aiModel = 'gpt-4o';
          // Garante que isPrivate esteja sincronizado com o repo real se possível, mas usa o salvo por enquanto
          // Se não tiver isPrivate salvo, tenta inferir do objeto repo
          if (parsed.isPrivate === undefined) parsed.isPrivate = repo.private;
          setSettings(prev => ({...prev, ...parsed}));
      } else {
          setSettings(prev => ({...DEFAULT_SETTINGS, name: repo.name, isPrivate: repo.private}));
      }

      setProjectData(null);
      
      try {
          if (!currentUser) return;
          if (!isAutoLoad) addLog(`Lendo arquivos de ${repo.name}...`);
          const files = await getRepoFiles(currentUser.githubToken, repo.owner.login, repo.name);
          setProjectData({ explanation: "Carregado do GitHub", commitTitle: "", commitDescription: "", files: files });
          if (files.length > 0 && !isAutoLoad) {
              addLog(`✅ Projeto carregado: ${files.length} arquivos.`);
              playSound('success');
          }
      } catch (e: any) {
          addLog(`Erro ao ler repositório: ${e.message}`);
          if (!isAutoLoad) playSound('error');
      } finally {
          setIsRepoLoading(false);
      }
  };

  const handleCommitTriggered = () => {
      setIsBuilding(true);
      setShowBuildOverlay(true);
      setLastRunId(null);
      setBuildTimeElapsed(0);
      addLog("------------------------------------------------");
      addLog(`🚀 Operação iniciada. Monitorando GitHub Actions...`);
  };

  const handleManualBuild = async () => {
    if (!currentUser || !currentRepo) return;
    try {
        addLog("🚀 Disparando Build Manualmente...");
        await triggerWorkflow(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, currentRepo.default_branch);
        handleCommitTriggered();
        playSound('click');
    } catch (e: any) {
        addLog(`Erro ao iniciar build: ${e.message}`);
        playSound('error');
    }
  };

  useEffect(() => {
      let interval: any;
      if (isBuilding) interval = setInterval(() => setBuildTimeElapsed(prev => prev + 1), 1000);
      return () => clearInterval(interval);
  }, [isBuilding]);

  // MONITORAMENTO CONSTANTE (Polling de 5s fixo)
  useEffect(() => {
      if (!isBuilding || !currentUser || !currentRepo) return;

      const checkBuildStatus = async () => {
          try {
              const run = await getLatestWorkflowRun(currentUser.githubToken, currentRepo.owner.login, currentRepo.name);
              
              if (!run) return;

              // Detecta novo Run ID
              if (lastRunId === null || run.id !== lastRunId) {
                  setLastRunId(run.id);
                  addLog(`🔨 Build detectado: #${run.run_number} (${run.status})`);
              }

              if (run.status === 'completed') {
                  if (run.conclusion === 'success') {
                      setIsBuilding(false);
                      setShowBuildOverlay(false);

                      const tagVersion = `v1.0.${run.run_number}`;
                      addLog(`✅ Build #${run.run_number} Concluído!`);
                      
                      // AUTOMATIC DOWNLOAD LOGIC
                      addLog(`⬇️ Baixando plugin automaticamente...`);
                      speakText("Build sucesso. Baixando arquivo.");
                      
                      // Tentativa de download (pode precisar de alguns segundos para a release propagar)
                      setTimeout(async () => {
                          const downloaded = await downloadReleaseJar(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, run.run_number);
                          if (downloaded) {
                              addLog(`📦 Arquivo salvo na pasta Downloads.`);
                              playSound('success');
                          } else {
                              addLog(`⚠️ Não foi possível baixar automaticamente. Verifique o GitHub.`);
                              playSound('message');
                          }
                      }, 2000);

                  } else {
                      setIsBuilding(false);
                      setShowBuildOverlay(false);
                      
                      addLog(`❌ Build #${run.run_number} Falhou.`);
                      playSound('error');
                      speakText("O build falhou.");
                      handleAutoFix(run.id);
                  }
              }
          } catch (e) { 
              console.error("Erro polling build", e); 
          }
      };

      const intervalId = setInterval(checkBuildStatus, 5000);
      checkBuildStatus(); 

      return () => clearInterval(intervalId);
  }, [isBuilding, currentUser, currentRepo, lastRunId]);

  const handleAutoFix = async (runId: number) => {
      if (!currentUser || !currentRepo) return;
      try {
          addLog("🔍 Analisando logs de erro...");
          const logs = await getWorkflowRunLogs(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, runId);
          const errorMsg: ChatMessage = {
              role: 'user',
              text: `O build falhou! Analise estes logs e corrija o código:\n\n${logs}`,
              id: Date.now().toString()
          };
          setMessages(prev => [...prev, errorMsg]);
          
          setIsGenerating(true);
          addLog("🤖 IA gerando correção automática...");
          
          const { project: fix, usage } = await generatePluginCode(errorMsg.text, settings, projectData, [], currentUser);
          updateUsage(usage);
          
          addLog("🛠️ Aplicando correção e reiniciando build...");
          await commitToRepo(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, fix.files, fix.commitTitle || "fix: correção de build", fix.commitDescription || "Correção automática.");
          
          const aiResponse: ChatMessage = { role: 'model', text: `Corrigi o erro: ${fix.explanation}. Novo build disparado.`, projectData: fix, id: Date.now().toString() + '_fix' };
          setMessages(prev => [...prev, aiResponse]);
          setProjectData(fix);
          
          setIsGenerating(false);
          handleCommitTriggered();
      } catch (e: any) { 
          setIsGenerating(false);
          addLog(`Falha na auto-correção: ${e.message}`); 
      }
  };

  const visualProgress = Math.min(100, (buildTimeElapsed / ESTIMATED_BUILD_TIME) * 100);
  const remainingSeconds = Math.max(0, ESTIMATED_BUILD_TIME - buildTimeElapsed);

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden relative">
      <AuthModal isOpen={isAuthOpen} onAuthSuccess={(u) => { setCurrentUser(u); setIsAuthOpen(false); }} />
      
      {/* OVERLAY DE GERAÇÃO (IA) */}
      {isGenerating && (
        <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col animate-fade-in">
           <div className="bg-[#252526] p-8 rounded-xl border border-[#444] shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full text-center">
                <div className="relative">
                    <BrainCircuit className="w-16 h-16 text-mc-accent animate-pulse" />
                    <div className="absolute -bottom-1 -right-1"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>
                </div>
                <div>
                   <h2 className="text-xl font-bold text-white mb-2">IA Pensando...</h2>
                   <p className="text-sm text-gray-400">Escrevendo o código do seu plugin.</p>
                </div>
           </div>
        </div>
      )}

      {/* OVERLAY DE BUILD (GITHUB) */}
      {showBuildOverlay && isBuilding && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center flex-col animate-fade-in">
           <div className="bg-[#252526] p-8 rounded-xl border border-[#444] shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full text-center">
               <div className="relative">
                   <Clock className="w-16 h-16 text-mc-gold animate-bounce" />
                   <div className="absolute -bottom-1 -right-1"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>
               </div>
               <div className="w-full">
                   <h2 className="text-xl font-bold text-white mb-1">Compilando Plugin</h2>
                   <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-4">GitHub Actions #{lastRunId || '---'}</p>
                   
                   <div className="w-full h-2 bg-[#333] rounded-full overflow-hidden mb-2">
                       <div className="h-full bg-mc-green transition-all duration-1000 linear" style={{width: `${visualProgress}%`}}></div>
                   </div>
                   
                   <p className="text-xs text-gray-400 mb-6">
                       {buildTimeElapsed < ESTIMATED_BUILD_TIME 
                         ? `Tempo estimado: ~${remainingSeconds}s` 
                         : "O build está demorando mais que o esperado..."}
                   </p>

                   <div className="flex flex-col gap-2">
                        <button 
                            onClick={() => setShowBuildOverlay(false)}
                            className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <ChevronDown className="w-4 h-4" /> Continuar em Segundo Plano
                        </button>
                        {currentRepo && (
                            <a 
                                href={`${currentRepo.html_url}/actions`} 
                                target="_blank" 
                                className="text-[10px] text-mc-accent hover:underline flex items-center justify-center gap-1"
                            >
                                Ver no GitHub <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                   </div>
               </div>
           </div>
        </div>
      )}

      {currentUser && (
        <>
            <Sidebar 
                isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                settings={settings} setSettings={setSettings}
                currentUser={currentUser} onLogout={() => { setCurrentUser(null); setIsAuthOpen(true); }}
                repos={repos} currentRepoId={currentRepo?.id || null}
                onSelectRepo={handleSelectRepo} onCreateRepo={handleCreateRepo}
                onRefreshRepos={refreshRepos} isLoadingRepos={isLoadingRepos}
                usageStats={usageStats}
            />
            <div className="flex-1 flex flex-col md:flex-row h-full min-w-0">
                <div className="flex-1 md:w-[35%] h-full flex flex-col min-w-0 border-r border-[#333]">
                    <ChatInterface 
                        settings={settings} messages={messages} setMessages={setMessages}
                        currentRepo={currentRepo} currentProject={projectData}
                        onProjectGenerated={setProjectData} currentUser={currentUser}
                        isBuilding={isBuilding} onCommitTriggered={handleCommitTriggered}
                        isGenerating={isGenerating} setIsGenerating={setIsGenerating}
                        usageStats={usageStats} onUsageUpdate={updateUsage}
                        repoLoading={isLoadingRepos || isRepoLoading}
                        onManualBuild={handleManualBuild}
                    />
                </div>
                <div className="hidden md:flex flex-1 md:w-[65%] h-full flex-col min-w-0">
                    <CodeViewer project={projectData} settings={settings} directoryHandle={null} onAddToContext={() => {}} />
                    
                    {/* Barra de Progresso Compacta Inferior (Sempre visível se estiver buildando) */}
                    {isBuilding && (
                        <div 
                            className="bg-[#1e1e1e] border-t border-[#333] px-4 py-2 cursor-pointer hover:bg-[#252526] transition-colors"
                            onClick={() => setShowBuildOverlay(true)}
                        >
                            <div className="flex justify-between items-center text-[10px] text-mc-gold font-mono mb-1">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span className="font-bold">GITHUB BUILD EM CURSO</span>
                                    <span className="text-gray-600">|</span>
                                    <span>RUN #{lastRunId || 'PENDENTE'}</span>
                                </div>
                                <span>{buildTimeElapsed}s decorridos</span>
                            </div>
                            <div className="w-full bg-[#111] h-1 rounded-full overflow-hidden">
                                <div className="bg-mc-green h-full transition-all duration-1000" style={{width: `${visualProgress}%`}}></div>
                            </div>
                        </div>
                    )}

                    <Terminal logs={terminalLogs} isOpen={true} onClose={() => {}} onClear={() => setTerminalLogs([])} onAddLog={addLog} />
                </div>
            </div>
        </>
      )}
    </div>
  );
};

export default App;
