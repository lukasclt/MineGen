
import React, { useState, useEffect, useRef } from 'react';
import { PluginSettings, GeneratedProject, ChatMessage, User, GitHubRepo, GeneratedFile, AIProvider, UsageStats } from './types';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import AuthModal from './components/AuthModal';
import { DEFAULT_SETTINGS, getGithubWorkflowYml } from './constants';
import { getUserRepos, createRepository, getRepoFiles, getLatestWorkflowRun, getWorkflowRunLogs, commitToRepo, triggerWorkflow } from './services/githubService';
import { playSound, speakText } from './services/audioService';
import { generatePluginCode } from './services/geminiService';
import { Loader2, Hammer, BrainCircuit, Clock } from 'lucide-react';

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
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  const [buildTimeElapsed, setBuildTimeElapsed] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);

  // --- CONTROLE DE USO REAL DO COPILOT ---
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
      
      try {
          addLog("Criando repositório no GitHub...");
          const newRepo = await createRepository(currentUser.githubToken, name, "Projeto MineGen AI");
          setRepos(prev => [newRepo, ...prev]);
          setCurrentRepo(newRepo);
          setMessages([]);
          
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
          setSettings(prev => ({...prev, ...parsed}));
      } else {
          setSettings(prev => ({...DEFAULT_SETTINGS, name: repo.name}));
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
      setLastRunId(null);
      setBuildTimeElapsed(0);
      addLog("------------------------------------------------");
      addLog(`🚀 Commit realizado! Iniciando espera de ${ESTIMATED_BUILD_TIME}s para o build...`);
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

  useEffect(() => {
      if (!isBuilding || !currentUser || !currentRepo) return;
      const checkBuildStatus = async () => {
          try {
              const run = await getLatestWorkflowRun(currentUser.githubToken, currentRepo.owner.login, currentRepo.name);
              if (!run) return;
              if (lastRunId === null || run.id !== lastRunId) {
                  setLastRunId(run.id);
                  addLog(`🔨 GitHub Actions: Build #${run.id} detectado.`);
              }
              if (run.status === 'completed') {
                  if (run.conclusion === 'success') {
                      setIsBuilding(false);
                      const tagVersion = `v1.0.${run.run_number}`;
                      addLog(`✅ Build #${run.id} Sucesso! (Tempo total: ${buildTimeElapsed}s)`);
                      addLog(`📦 Release ${tagVersion} publicada!`);
                      playSound('success');
                      speakText("Build e Release concluídos com sucesso.");
                  } else if (run.conclusion === 'failure') {
                      setIsBuilding(false);
                      addLog(`❌ Build #${run.id} Falhou após ${buildTimeElapsed}s.`);
                      playSound('error');
                      speakText("O build falhou.");
                      handleAutoFix(run.id);
                  }
              }
          } catch (e) { console.error("Erro polling build", e); }
      };
      let intervalId: any;
      if (buildTimeElapsed >= ESTIMATED_BUILD_TIME) {
          checkBuildStatus();
          intervalId = setInterval(checkBuildStatus, 1000);
      } else if (lastRunId === null) {
          intervalId = setInterval(checkBuildStatus, 3000);
      }
      return () => clearInterval(intervalId);
  }, [isBuilding, currentUser, currentRepo, lastRunId, buildTimeElapsed]);

  const handleAutoFix = async (runId: number) => {
      if (!currentUser || !currentRepo) return;
      try {
          addLog("🔍 Baixando logs do erro...");
          const logs = await getWorkflowRunLogs(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, runId);
          const errorMsg: ChatMessage = {
              role: 'user',
              text: `O build falhou! Analise estes logs e corrija o código:\n\n${logs}`,
              id: Date.now().toString()
          };
          setMessages(prev => [...prev, errorMsg]);
          addLog("🤖 IA analisando erro e gerando correção...");
          const { project: fix, usage } = await generatePluginCode(errorMsg.text, settings, projectData, [], currentUser);
          updateUsage(usage);
          addLog("🛠️ Aplicando correção no GitHub...");
          await commitToRepo(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, fix.files, fix.commitTitle || "fix: correção de build", fix.commitDescription || "Correção automática.");
          const aiResponse: ChatMessage = { role: 'model', text: `Corrigi o erro: ${fix.explanation}. Novo build disparado.`, projectData: fix, id: Date.now().toString() + '_fix' };
          setMessages(prev => [...prev, aiResponse]);
          setProjectData(fix);
          handleCommitTriggered();
      } catch (e: any) { addLog(`Falha fatal na auto-correção: ${e.message}`); }
  };

  const showOverlay = isGenerating || isBuilding;
  const visualProgress = Math.min(100, (buildTimeElapsed / ESTIMATED_BUILD_TIME) * 100);
  const remainingSeconds = Math.max(0, ESTIMATED_BUILD_TIME - buildTimeElapsed);

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden relative">
      <AuthModal isOpen={isAuthOpen} onAuthSuccess={(u) => { setCurrentUser(u); setIsAuthOpen(false); }} />
      {showOverlay && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col animate-fade-in">
           <div className="bg-[#252526] p-8 rounded-xl border border-[#444] shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full text-center">
               {isGenerating ? (
                   <div className="relative">
                       <BrainCircuit className="w-16 h-16 text-mc-accent animate-pulse" />
                       <div className="absolute -bottom-1 -right-1"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>
                   </div>
               ) : (
                   <div className="relative">
                       <Clock className="w-16 h-16 text-mc-gold animate-bounce" />
                       <div className="absolute -bottom-1 -right-1"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>
                   </div>
               )}
               <div>
                   <h2 className="text-xl font-bold text-white mb-2">{isGenerating ? "Criando Código..." : "Compilando Plugin..."}</h2>
                   <p className="text-sm text-gray-400">{isGenerating ? "A IA está analisando sua solicitação..." : `Aguardando GitHub Actions... (${remainingSeconds}s)`}</p>
               </div>
               {isBuilding && (
                   <div className="w-full h-2 bg-[#333] rounded-full overflow-hidden mt-2">
                       <div className="h-full bg-mc-green transition-all duration-1000 linear" style={{width: `${visualProgress}%`}}></div>
                   </div>
               )}
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
                    <Terminal logs={terminalLogs} isOpen={true} onClose={() => {}} onClear={() => setTerminalLogs([])} onAddLog={addLog} />
                </div>
            </div>
        </>
      )}
    </div>
  );
};

export default App;
