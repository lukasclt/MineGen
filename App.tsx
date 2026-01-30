
import React, { useState, useEffect, useRef } from 'react';
import { PluginSettings, GeneratedProject, ChatMessage, User, GitHubRepo, GeneratedFile } from './types';
import Sidebar from './components/ConfigSidebar';
import ChatInterface from './components/ChatInterface';
import CodeViewer from './components/CodeViewer';
import Terminal from './components/Terminal';
import AuthModal from './components/AuthModal';
import { DEFAULT_SETTINGS, getGithubWorkflowYml } from './constants';
import { getUserRepos, createRepository, getRepoFiles, getLatestWorkflowRun, getWorkflowRunLogs, commitToRepo } from './services/githubService';
import { playSound, speakText } from './services/audioService';
import { generatePluginCode } from './services/geminiService';

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

  const addLog = (msg: string) => setTerminalLogs(prev => [...prev, msg]);

  // Auth Load
  useEffect(() => {
     const saved = localStorage.getItem('minegen_user_github');
     if (saved) {
         setCurrentUser(JSON.parse(saved));
         setIsAuthOpen(false);
     }
  }, []);

  // Repo Load
  useEffect(() => {
     if (currentUser) {
         localStorage.setItem('minegen_user_github', JSON.stringify(currentUser));
         refreshRepos();
     }
  }, [currentUser]);

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

  const handleSelectRepo = async (repo: GitHubRepo) => {
      setCurrentRepo(repo);
      setProjectData(null);
      setMessages([]);
      if (!currentUser) return;

      addLog(`Lendo arquivos de ${repo.name} (Modo Otimizado)...`);
      try {
          const files = await getRepoFiles(currentUser.githubToken, repo.owner.login, repo.name);
          setProjectData({
              explanation: "Carregado do GitHub",
              commitTitle: "",
              commitDescription: "",
              files: files
          });
          
          if (files.length > 0) {
              addLog(`✅ Projeto carregado: ${files.length} arquivos.`);
              playSound('success');
          } else {
              addLog("Repositório vazio. Use o chat para gerar o código inicial.");
          }
      } catch (e: any) {
          addLog(`Erro ao ler repositório: ${e.message}`);
          playSound('error');
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
                  // Simula progresso logarítmico até 90%, depois espera o GitHub
                  if (prev < 90) return prev + (Math.random() * 2); 
                  return prev;
              });
          }, 1000);
      } else {
          setBuildProgress(100);
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
                  addLog(`🔨 GitHub Actions: Build #${run.id} iniciado.`);
              }

              if (run.status === 'in_progress') {
                  const estimatedTotal = 90; // média de 90s
                  const remaining = Math.max(0, estimatedTotal - buildTimeElapsed);
                  // Log apenas a cada ~10s para não spammar
                  if (buildTimeElapsed % 10 === 0) {
                     addLog(`⏳ Compilando... Tempo decorrido: ${buildTimeElapsed}s. (Est. restante: ${remaining}s)`);
                  }
              }

              if (run.status === 'completed') {
                  if (run.conclusion === 'success') {
                      setIsBuilding(false);
                      setBuildProgress(100);
                      const tagVersion = `v1.0.${run.run_number}`;
                      
                      addLog(`✅ Build #${run.id} Sucesso! (Tempo total: ${buildTimeElapsed}s)`);
                      addLog(`📦 Release ${tagVersion} gerada e publicada no GitHub!`);
                      addLog(`⬇️ Baixe o JAR na aba 'Releases' do seu repositório.`);
                      
                      playSound('success');
                      speakText("Build concluído com sucesso. Release publicada.");
                  } else if (run.conclusion === 'failure') {
                      setIsBuilding(false);
                      addLog(`❌ Build #${run.id} Falhou após ${buildTimeElapsed}s.`);
                      playSound('error');
                      handleAutoFix(run.id);
                  }
              }
          } catch (e) {
              console.error("Erro polling build", e);
          }
      }, 5000); // Check a cada 5s

      return () => clearInterval(interval);
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
          speakText("O build falhou. Analisando erro.");
          
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

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden">
      <AuthModal isOpen={isAuthOpen} onAuthSuccess={(u) => { setCurrentUser(u); setIsAuthOpen(false); }} />

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
                    />
                </div>
                <div className="hidden md:flex flex-1 md:w-[65%] h-full flex-col min-w-0">
                    <CodeViewer 
                        project={projectData} settings={settings} 
                        directoryHandle={null} 
                        onAddToContext={() => {}} 
                    />
                    
                    {/* Barra de Progresso do Build */}
                    {isBuilding && (
                        <div className="bg-[#252526] border-t border-[#333] px-4 py-2">
                            <div className="flex justify-between text-xs text-white mb-1 font-mono">
                                <span>BUILD EM ANDAMENTO (Run #{lastRunId || '...'})</span>
                                <span>{Math.min(100, Math.floor(buildProgress))}%</span>
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
