
import React, { useState, useEffect, useRef } from 'react';
import { PluginSettings, GeneratedProject, ChatMessage, User, GitHubRepo, GeneratedFile, AIProvider } from './types';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import AuthModal from './components/AuthModal';
import { DEFAULT_SETTINGS, getGithubWorkflowYml } from './constants';
import { getUserRepos, createRepository, getRepoFiles, getLatestWorkflowRun, getWorkflowRunLogs, commitToRepo } from './services/githubService';
import { playSound, speakText } from './services/audioService';
import { generatePluginCode } from './services/geminiService';
import { Loader2, Hammer, BrainCircuit } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(true);
  
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [currentRepo, setCurrentRepo] = useState<GitHubRepo | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  
  const [projectData, setProjectData] = useState<GeneratedProject | null>(null);
  const [settings, setSettings] = useState<PluginSettings>(DEFAULT_SETTINGS);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  
  // Build & Release State
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  const [buildProgress, setBuildProgress] = useState(0); // 0-100%
  const [buildTimeElapsed, setBuildTimeElapsed] = useState(0);

  // IA Generation State (Lifting State Up)
  const [isGenerating, setIsGenerating] = useState(false);

  const addLog = (msg: string) => setTerminalLogs(prev => [...prev, msg]);

  // --- PERSISTÊNCIA (COOKIES/LOCALSTORAGE) ---

  // Carregar usuário
  useEffect(() => {
     const savedUser = localStorage.getItem('minegen_user_github');
     if (savedUser) {
         setCurrentUser(JSON.parse(savedUser));
         setIsAuthOpen(false);
     }
  }, []);

  // Carregar último repo e histórico
  useEffect(() => {
     if (currentUser && !currentRepo) {
        const savedRepo = localStorage.getItem(`minegen_last_repo_${currentUser.id}`);
        if (savedRepo) {
             const repo = JSON.parse(savedRepo);
             setCurrentRepo(repo);
             handleSelectRepo(repo, true); // true = skip fetching files initially if wanted, but lets fetch to be safe
        }
     }
  }, [currentUser]);

  // Salvar usuário
  useEffect(() => {
     if (currentUser) {
         localStorage.setItem('minegen_user_github', JSON.stringify(currentUser));
         refreshRepos();
     } else {
         localStorage.removeItem('minegen_user_github');
     }
  }, [currentUser]);

  // Salvar Repo, Chat E SETTINGS específicas do Repo
  useEffect(() => {
      if (currentUser && currentRepo) {
          localStorage.setItem(`minegen_last_repo_${currentUser.id}`, JSON.stringify(currentRepo));
          // Salva histórico de chat específico deste repo
          localStorage.setItem(`minegen_chat_${currentRepo.id}`, JSON.stringify(messages));
          // Salva Settings específicas (ex: Java Version)
          localStorage.setItem(`minegen_settings_${currentRepo.id}`, JSON.stringify(settings));
      }
  }, [currentRepo, messages, currentUser, settings]);

  // --- FUNÇÕES ---

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
          setMessages([]); // Novo repo, chat limpo
          
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
      setCurrentRepo(repo);
      
      // Carrega chat salvo
      const savedChat = localStorage.getItem(`minegen_chat_${repo.id}`);
      if (savedChat) {
          setMessages(JSON.parse(savedChat));
      } else if (!isAutoLoad) {
          setMessages([]);
      }

      // Carrega Settings salvas (ex: Java Version)
      const savedSettings = localStorage.getItem(`minegen_settings_${repo.id}`);
      if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          // GARANTIR QUE SEMPRE USA GITHUB COPILOT
          parsed.aiProvider = AIProvider.GITHUB_COPILOT;
          parsed.aiModel = 'gpt-4o';
          setSettings(prev => ({...prev, ...parsed}));
      } else {
          // Se não tiver settings salvas, tenta inferir pelo nome ou usa padrão
          setSettings(prev => ({...DEFAULT_SETTINGS, name: repo.name}));
      }

      setProjectData(null);
      if (!currentUser) return;

      if (!isAutoLoad) addLog(`Lendo arquivos de ${repo.name}...`);
      
      try {
          const files = await getRepoFiles(currentUser.githubToken, repo.owner.login, repo.name);
          setProjectData({
              explanation: "Carregado do GitHub",
              commitTitle: "",
              commitDescription: "",
              files: files
          });
          
          if (files.length > 0) {
              if (!isAutoLoad) {
                  addLog(`✅ Projeto carregado: ${files.length} arquivos.`);
                  playSound('success');
              }
          } else {
              addLog("Repositório vazio. Use o chat para gerar o código inicial.");
          }
      } catch (e: any) {
          addLog(`Erro ao ler repositório: ${e.message}`);
          if (!isAutoLoad) playSound('error');
      }
  };

  // --- LOGIC DE BUILD & PROGRESSO ---
  
  const handleCommitTriggered = () => {
      setIsBuilding(true);
      setLastRunId(null);
      setBuildProgress(0);
      setBuildTimeElapsed(0);
      addLog("------------------------------------------------");
      addLog("🚀 Commit realizado! Aguardando início do Build...");
  };

  // Simulador de Progresso Visual
  useEffect(() => {
      let interval: any;
      if (isBuilding) {
          interval = setInterval(() => {
              setBuildTimeElapsed(prev => prev + 1);
              setBuildProgress(prev => {
                  // Simula progresso logarítmico até 95%
                  if (prev < 95) return prev + (Math.random() * 1.5); 
                  return prev;
              });
          }, 1000);
      } else {
          if (!isBuilding && buildProgress > 0 && buildProgress < 100) {
              setBuildProgress(100);
          }
      }
      return () => clearInterval(interval);
  }, [isBuilding]);

  // Monitoramento do GitHub Actions
  useEffect(() => {
      if (!isBuilding || !currentUser || !currentRepo) return;

      const interval = setInterval(async () => {
          try {
              const run = await getLatestWorkflowRun(currentUser.githubToken, currentRepo.owner.login, currentRepo.name);
              
              if (!run) return;

              if (lastRunId === null || run.id !== lastRunId) {
                  setLastRunId(run.id);
                  addLog(`🔨 GitHub Actions: Build #${run.id} detectado.`);
              }

              if (run.status === 'in_progress') {
                  const estimatedTotal = 90; // média de 90s para build Gradle
                  const remaining = Math.max(0, estimatedTotal - buildTimeElapsed);
                  const progress = Math.min(99, Math.floor(buildProgress));
                  
                  // Log detalhado a cada ~5s
                  if (buildTimeElapsed % 5 === 0) {
                     addLog(`⏳ Compilando... ${progress}% (Decorridos: ${buildTimeElapsed}s | Restante est.: ${remaining}s)`);
                  }
              }

              if (run.status === 'completed') {
                  if (run.conclusion === 'success') {
                      setIsBuilding(false);
                      setBuildProgress(100);
                      const tagVersion = `v1.0.${run.run_number}`;
                      
                      addLog(`✅ Build #${run.id} Sucesso! (100% - Tempo total: ${buildTimeElapsed}s)`);
                      addLog(`📦 Release ${tagVersion} publicada!`);
                      addLog(`⬇️ Download disponível na aba 'Releases' do GitHub.`);
                      
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
          } catch (e) {
              console.error("Erro polling build", e);
          }
      }, 1000); // Check a cada 1s para detecção rápida

      return () => clearInterval(interval);
  }, [isBuilding, currentUser, currentRepo, lastRunId, buildTimeElapsed]);

  const handleAutoFix = async (runId: number) => {
      if (!currentUser || !currentRepo) return;
      
      try {
          addLog("🔍 Baixando logs do erro...");
          const logs = await getWorkflowRunLogs(currentUser.githubToken, currentRepo.owner.login, currentRepo.name, runId);
          
          const errorMsg: ChatMessage = {
              role: 'user',
              text: `O build falhou! Analise estes logs e corrija o código (verifique se .github/workflows/gradle.yml está correto):\n\n${logs}`,
              id: Date.now().toString()
          };
          setMessages(prev => [...prev, errorMsg]);
          
          addLog("🤖 IA analisando erro e gerando correção...");
          
          // Nota: Auto-fix usa o serviço, mas não bloqueia a UI da mesma forma que o chat manual, 
          // ou podemos querer bloquear também. Por enquanto deixamos assíncrono.
          const fix = await generatePluginCode(errorMsg.text, settings, projectData, [], currentUser);
          
          addLog("🛠️ Aplicando correção no GitHub...");
          await commitToRepo(
              currentUser.githubToken, 
              currentRepo.owner.login, 
              currentRepo.name, 
              fix.files, 
              fix.commitTitle || "fix: correção de build", 
              fix.commitDescription || "Correção automática baseada nos logs de erro."
          );
          
          const aiResponse: ChatMessage = {
              role: 'model',
              text: `Corrigi o erro: ${fix.explanation}. Novo build disparado.`,
              projectData: fix,
              id: Date.now().toString() + '_fix'
          };
          setMessages(prev => [...prev, aiResponse]);
          setProjectData(fix);
          
          handleCommitTriggered();

      } catch (e: any) {
          addLog(`Falha fatal na auto-correção: ${e.message}`);
      }
  };

  const showOverlay = isGenerating || isBuilding;

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden relative">
      <AuthModal isOpen={isAuthOpen} onAuthSuccess={(u) => { setCurrentUser(u); setIsAuthOpen(false); }} />

      {/* OVERLAY DE BLOQUEIO / LOADING */}
      {showOverlay && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col animate-fade-in">
           <div className="bg-[#252526] p-8 rounded-xl border border-[#444] shadow-2xl flex flex-col items-center gap-4 max-w-sm w-full text-center">
               {isGenerating ? (
                   <div className="relative">
                       <BrainCircuit className="w-16 h-16 text-mc-accent animate-pulse" />
                       <div className="absolute -bottom-1 -right-1">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                       </div>
                   </div>
               ) : (
                   <div className="relative">
                       <Hammer className="w-16 h-16 text-mc-gold animate-bounce" />
                       <div className="absolute -bottom-1 -right-1">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                       </div>
                   </div>
               )}
               
               <div>
                   <h2 className="text-xl font-bold text-white mb-2">
                       {isGenerating ? "Criando Código..." : "Compilando Plugin..."}
                   </h2>
                   <p className="text-sm text-gray-400">
                       {isGenerating 
                         ? "A IA está analisando sua solicitação e escrevendo os arquivos." 
                         : `O GitHub Actions está construindo seu JAR. (${Math.floor(buildProgress)}%)`}
                   </p>
               </div>

               {isBuilding && (
                   <div className="w-full h-2 bg-[#333] rounded-full overflow-hidden mt-2">
                       <div className="h-full bg-mc-green transition-all duration-300" style={{width: `${buildProgress}%`}}></div>
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
            />

            <div className="flex-1 flex flex-col md:flex-row h-full min-w-0">
                <div className="flex-1 md:w-[35%] h-full flex flex-col min-w-0 border-r border-[#333]">
                    <ChatInterface 
                        settings={settings} messages={messages} setMessages={setMessages}
                        currentRepo={currentRepo} currentProject={projectData}
                        onProjectGenerated={setProjectData} currentUser={currentUser}
                        isBuilding={isBuilding} onCommitTriggered={handleCommitTriggered}
                        isGenerating={isGenerating} setIsGenerating={setIsGenerating}
                    />
                </div>
                <div className="hidden md:flex flex-1 md:w-[65%] h-full flex-col min-w-0">
                    <CodeViewer 
                        project={projectData} settings={settings} 
                        directoryHandle={null} 
                        onAddToContext={() => {}} 
                    />
                    
                    {/* Barra de Progresso do Build (Redundante com Overlay mas útil se o overlay for removido no futuro) */}
                    {isBuilding && !showOverlay && (
                        <div className="bg-[#252526] border-t border-[#333] px-4 py-2">
                            <div className="flex justify-between text-xs text-white mb-1 font-mono">
                                <span>BUILD EM ANDAMENTO (Run #{lastRunId || '...'})</span>
                                <span>{Math.min(100, Math.floor(buildProgress))}% (Est: {90 - buildTimeElapsed}s)</span>
                            </div>
                            <div className="w-full bg-[#333] h-2 rounded-full overflow-hidden">
                                <div 
                                    className="bg-mc-green h-full transition-all duration-300 ease-out"
                                    style={{ width: `${buildProgress}%` }}
                                ></div>
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
