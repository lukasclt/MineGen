import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Terminal, XCircle, CheckCircle2, RefreshCw, Hammer, Bug, ChevronDown, ChevronUp, Cloud, Github, UploadCloud, PlayCircle, Loader2, ArrowUpCircle, Sparkles, Wand2, StopCircle, RotateCcw } from 'lucide-react';
import JSZip from 'jszip';
import { fixPluginCode } from '../services/geminiService';
import { commitAndPushFiles, getLatestWorkflowRun, getBuildArtifact, downloadArtifact } from '../services/githubService';
import { GITHUB_ACTION_TEMPLATE } from '../constants';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings, onProjectUpdate }) => {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);
  
  // GitHub / Build State
  const [isCommitting, setIsCommitting] = useState(false);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'queued' | 'in_progress' | 'success' | 'failure'>('idle');
  const [buildLogs, setBuildLogs] = useState<string>("");
  const [showConsole, setShowConsole] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);
  
  // Eternal Fix State - Using Refs to prevent stale closures in setInterval
  const [isEternalMode, setIsEternalMode] = useState(false);
  const eternalModeRef = useRef(false);
  const [fixAttempt, setFixAttempt] = useState(0);
  const fixAttemptRef = useRef(0);
  const [isFixing, setIsFixing] = useState(false);
  
  // Current project ref to always have latest project state in async calls
  const projectRef = useRef(project);
  useEffect(() => { projectRef.current = project; }, [project]);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project && project.files.length > 0) {
      const currentPath = selectedFile?.path;
      const fileExists = project.files.find(f => f.path === currentPath);
      
      if (!selectedFile || !fileExists) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFile(mainFile);
      } else {
          if (fileExists && fileExists.content !== selectedFile?.content) {
             setSelectedFile(fileExists);
          }
      }
    } else {
        setSelectedFile(null);
    }
  }, [project]);

  useEffect(() => {
    if (showConsole) {
      setTimeout(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [buildLogs, showConsole, isFixing]);

  const handleCopy = () => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 1. Commit & Push
  const handleCommitAndPush = async (silent = false) => {
    if (!settings.github?.isConnected || !projectRef.current) {
        if (!silent) alert("GitHub não conectado.");
        return;
    }
    
    const workflowPath = ".github/workflows/build.yml";
    const workflowContent = GITHUB_ACTION_TEMPLATE(settings.javaVersion);
    
    let filesToPush = [...projectRef.current.files];
    const workflowIndex = filesToPush.findIndex(f => f.path === workflowPath);
    
    if (workflowIndex >= 0) {
        filesToPush[workflowIndex] = { ...filesToPush[workflowIndex], content: workflowContent };
    } else {
        filesToPush.push({ path: workflowPath, content: workflowContent, language: 'yaml' });
    }

    if (onProjectUpdate) {
        onProjectUpdate({ ...projectRef.current, files: filesToPush });
    }

    setIsCommitting(true);
    setBuildProgress(0);
    if (!silent) setShowConsole(true);
    setBuildLogs(prev => prev + `\n> [Round ${fixAttemptRef.current}] Enviando código (Java ${settings.javaVersion})...\n`);
    setBuildStatus('queued');

    try {
        await commitAndPushFiles(settings.github!, filesToPush, `Auto-fix attempt #${fixAttemptRef.current}`);
        setBuildLogs(prev => prev + `> Arquivos no GitHub. Iniciando Worker de Build...\n`);
        pollBuildStatus();
    } catch (e: any) {
        setBuildLogs(prev => prev + `> 🛑 ERRO no Push: ${e.message}\n`);
        setBuildStatus('idle');
        setIsEternalMode(false);
        eternalModeRef.current = false;
    } finally {
        setIsCommitting(false);
    }
  };

  // 2. Monitoramento
  const pollBuildStatus = async () => {
      if (!settings.github) return;
      
      let attempts = 0;
      let progressSim = 5;
      
      const pollInterval = setInterval(async () => {
          attempts++;
          
          // Simulação de porcentagem
          if (progressSim < 95) {
              progressSim += 1 + (Math.random() * 3);
              const p = Math.min(99, Math.round(progressSim));
              setBuildProgress(p);
          }

          try {
             const run = await getLatestWorkflowRun(settings.github!);
             
             if (run) {
                 if (run.status === 'completed') {
                     clearInterval(pollInterval);
                     setBuildProgress(100);
                     setBuildLogs(prev => prev + `> Build ${run.conclusion.toUpperCase()} (100%)\n`);
                     
                     if (run.conclusion === 'success') {
                         setBuildStatus('success');
                         setBuildLogs(prev => prev + `> ✅ JAR COMPILADO COM SUCESSO!\n`);
                         setIsEternalMode(false);
                         eternalModeRef.current = false;
                         const url = await getBuildArtifact(settings.github!, run.id);
                         if (url) setArtifactUrl(url);
                     } else {
                         setBuildStatus('failure');
                         setBuildLogs(prev => prev + `> ❌ Falha detectada no Maven.\n`);
                         
                         // CRITICAL FIX: Use ref to check if mode is still active
                         if (eternalModeRef.current) {
                             setBuildLogs(prev => prev + `> 🔄 MODO ETERNO: Acionando IA para correção imediata...\n`);
                             handleAutoFix();
                         }
                     }
                 } else {
                     setBuildStatus('in_progress');
                     if (attempts % 3 === 0) {
                         setBuildLogs(prev => prev + `> Compilando... [${Math.round(progressSim)}%]\n`);
                     }
                 }
             }
          } catch (e) { console.error(e); }

          if (attempts > 180) {
              clearInterval(pollInterval);
              setBuildLogs(prev => prev + `> 🛑 Timeout: Build interrompido.\n`);
              setIsEternalMode(false);
              eternalModeRef.current = false;
          }
      }, 3000);
  };

  // 3. Auto Fix & Loop
  const handleAutoFix = async () => {
      if (!projectRef.current || !buildLogs) return;
      
      setIsFixing(true);
      const nextAttempt = fixAttemptRef.current + 1;
      setFixAttempt(nextAttempt);
      fixAttemptRef.current = nextAttempt;
      
      setBuildLogs(prev => prev + `\n> 🤖 IA CORRIGINDO (Tentativa #${nextAttempt})...\n> Analisando logs de erro do Maven para Java ${settings.javaVersion}...\n`);
      
      try {
          const relevantLogs = buildLogs.slice(-5000); 
          const fixedProject = await fixPluginCode(projectRef.current, relevantLogs, settings);
          
          if (onProjectUpdate) {
              onProjectUpdate(fixedProject);
          }
          
          setBuildLogs(prev => prev + `> 🧠 IA: Problemas corrigidos. Reiniciando build automático...\n`);
          
          setTimeout(() => {
              handleCommitAndPush(true);
          }, 2000);
          
      } catch (e: any) {
          setBuildLogs(prev => prev + `> ❌ Erro Crítico na IA: ${e.message}\n`);
          setIsEternalMode(false);
          eternalModeRef.current = false;
      } finally {
          setIsFixing(false);
      }
  };

  const toggleEternalMode = () => {
      if (!isEternalMode) {
          setIsEternalMode(true);
          eternalModeRef.current = true;
          setFixAttempt(0);
          fixAttemptRef.current = 0;
          setBuildLogs(prev => prev + "\n> ♾️ MODO ETERNO ATIVADO: A IA entrará em loop de correção até o sucesso.\n");
          if (buildStatus === 'failure' || buildStatus === 'idle' || buildStatus === 'success') {
              handleCommitAndPush();
          }
      } else {
          setIsEternalMode(false);
          eternalModeRef.current = false;
          setBuildLogs(prev => prev + "\n> 🛑 Modo Eterno desativado pelo usuário.\n");
      }
  };

  const handleDownloadArtifact = async () => {
      if (!artifactUrl || !settings.github) return;
      try {
          await downloadArtifact(settings.github.token, artifactUrl, `${settings.name}-build.zip`);
      } catch (e: any) { alert("Erro ao baixar: " + e.message); }
  };

  const handleDownloadSource = async () => {
    if (!projectRef.current) return;
    const zip = new JSZip();
    projectRef.current.files.forEach(file => zip.file(file.path, file.content));
    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settings.name}-maven-source.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-transparent text-gray-500 h-full p-8 text-center border-l border-gray-800">
        <FileCode className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Nenhum Código Gerado Ainda</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]/95 backdrop-blur-sm border-l border-gray-800 overflow-hidden relative">
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526]/90 shrink-0">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name} <span className="text-gray-500 text-xs">({settings.version})</span>
            </h3>
            
            <div className="flex items-center gap-2">
                 <div className="flex items-center bg-black/30 rounded-lg p-0.5 border border-gray-700 mr-2">
                    <button 
                      onClick={() => handleCommitAndPush()}
                      disabled={isCommitting || !settings.github?.isConnected || isFixing}
                      className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${!settings.github?.isConnected ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                    >
                        {isCommitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <UploadCloud className="w-3 h-3" />}
                        <span className="hidden xl:inline">Commit & Push</span>
                    </button>

                    <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>
                    
                    {buildStatus === 'success' && artifactUrl ? (
                         <button onClick={handleDownloadArtifact} className="text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold bg-green-500/20 text-green-300 hover:bg-green-500/30 animate-pulse">
                            <Download className="w-3 h-3" /> <span>Download JAR</span>
                         </button>
                    ) : (
                         <button onClick={() => { setShowConsole(true); handleCommitAndPush(); }} disabled={!settings.github?.isConnected || isFixing} className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${buildStatus === 'in_progress' || buildStatus === 'queued' ? 'text-yellow-400' : buildStatus === 'failure' ? 'text-red-400' : 'text-gray-300 hover:bg-gray-700'}`}>
                            {buildStatus === 'in_progress' || buildStatus === 'queued' ? <RefreshCw className="w-3 h-3 animate-spin"/> : <PlayCircle className="w-3 h-3" />}
                            <span className="hidden xl:inline">{buildStatus === 'in_progress' || buildStatus === 'queued' ? `Compilando (${buildProgress}%)` : 'Build Maven'}</span>
                         </button>
                    )}

                    <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>

                    <button onClick={() => setShowConsole(!showConsole)} className={`p-1.5 rounded-md transition-colors ${showConsole ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                      <Terminal className="w-3 h-3" />
                    </button>
                 </div>

                <button onClick={handleDownloadSource} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                    <Download className="w-3 h-3" /> <span className="hidden md:inline">Fonte</span>
                </button>
            </div>
        </div>

      <div className="flex-1 flex overflow-hidden relative z-0">
        <div className="w-60 bg-[#252526]/80 border-r border-gray-700 overflow-y-auto flex-shrink-0 custom-scrollbar">
          <div className="py-2">
            {project?.files.map((file, index) => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFile?.path === file.path;
               let iconColor = 'text-gray-400';
               if (fileName?.endsWith('.java')) iconColor = 'text-orange-400';
               else if (fileName?.endsWith('.xml')) iconColor = 'text-blue-400';
               return (
                <button key={index} onClick={() => setSelectedFile(file)} className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 truncate hover:bg-[#2a2d2e] transition-colors ${isSelected ? 'bg-[#37373d] text-white border-l-2 border-mc-accent' : 'text-gray-400 border-l-2 border-transparent'}`}>
                    <FileCode className={`w-4 h-4 ${iconColor}`} />
                    <span className="truncate">{fileName}</span>
                </button>
               )
            })}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-transparent">
            {selectedFile ? (
                <>
                    <div className="h-9 flex items-center justify-between px-4 bg-[#1e1e1e]/50 border-b border-gray-800 shrink-0">
                        <span className="text-xs text-gray-400 font-mono">{selectedFile.path}</span>
                        <button onClick={handleCopy} className="text-gray-400 hover:text-white transition-colors">
                            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        <pre className="font-mono text-sm text-gray-300 leading-relaxed">
                            <code>{selectedFile.content}</code>
                        </pre>
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500">Selecione um arquivo</div>
            )}
        </div>
      </div>

      {showConsole && (
        <div className={`absolute bottom-0 left-0 right-0 z-20 border-t border-gray-700 bg-gray-950/95 backdrop-blur-md flex flex-col shadow-2xl transition-all duration-300 h-72`}>
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-700 h-10 shrink-0">
            <div className="flex items-center gap-3 text-xs font-mono">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-gray-300">Terminal: Maven Logs</span>
              
              {(buildStatus === 'in_progress' || buildStatus === 'queued') && (
                <span className="text-yellow-400 font-bold ml-2">Progress: {buildProgress}%</span>
              )}

              {isEternalMode && (
                  <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded animate-pulse">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span className="text-purple-300 text-[10px] font-bold uppercase tracking-wider">Eternal Active (Attempt #{fixAttempt})</span>
                  </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleEternalMode}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all border ${isEternalMode ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-purple-500/20 border-purple-500/50 text-purple-300 hover:bg-purple-500/40'}`}
              >
                 {isEternalMode ? <><StopCircle className="w-3 h-3" /> Parar Loop</> : <><RotateCcw className="w-3 h-3" /> Auto-Fix Loop</>}
              </button>
              
              <button onClick={() => setShowConsole(false)} className="text-gray-400 hover:text-white">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-gray-300 custom-scrollbar bg-black/40">
            <pre className="whitespace-pre-wrap">{buildLogs || "> Console pronto para build Maven..."}</pre>
            {isFixing && (
                <div className="flex flex-col gap-1 mt-3">
                  <div className="flex items-center gap-2 text-purple-400 animate-pulse font-bold">
                      <Wand2 className="w-4 h-4" /> IA ESTÁ ANALISANDO E CORRIGINDO O CÓDIGO AGORA...
                  </div>
                  <div className="w-48 h-1 bg-purple-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 animate-[loading_2s_ease-in-out_infinite]" />
                  </div>
                </div>
            )}
            <div ref={consoleEndRef} />
          </div>
          
          <style>{`
            @keyframes loading {
              0% { width: 0%; transform: translateX(-100%); }
              50% { width: 100%; transform: translateX(0); }
              100% { width: 0%; transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default CodeViewer;