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
  
  // Eternal Fix State
  const [isEternalMode, setIsEternalMode] = useState(false);
  const [fixAttempt, setFixAttempt] = useState(0);
  const [isFixing, setIsFixing] = useState(false);

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
      consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [buildLogs, showConsole]);

  const handleCopy = () => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 1. Commit & Push
  const handleCommitAndPush = async (silent = false) => {
    if (!settings.github?.isConnected || !project) {
        if (!silent) alert("GitHub não conectado.");
        return;
    }
    
    const workflowPath = ".github/workflows/build.yml";
    const workflowContent = GITHUB_ACTION_TEMPLATE(settings.javaVersion);
    
    let filesToPush = [...project.files];
    const workflowIndex = filesToPush.findIndex(f => f.path === workflowPath);
    
    if (workflowIndex >= 0) {
        filesToPush[workflowIndex] = { ...filesToPush[workflowIndex], content: workflowContent };
    } else {
        filesToPush.push({ path: workflowPath, content: workflowContent, language: 'yaml' });
    }

    if (onProjectUpdate) {
        onProjectUpdate({ ...project, files: filesToPush });
    }

    setIsCommitting(true);
    if (!silent) setShowConsole(true);
    setBuildLogs(prev => prev + `\n> [Round ${fixAttempt}] Enviando para GitHub (Java ${settings.javaVersion})...\n`);
    setBuildStatus('queued');

    try {
        await commitAndPushFiles(settings.github!, filesToPush, `Auto-fix attempt #${fixAttempt} (Java ${settings.javaVersion})`);
        setBuildLogs(prev => prev + `> Arquivos enviados. Aguardando processamento...\n`);
        pollBuildStatus();
    } catch (e: any) {
        setBuildLogs(prev => prev + `> ERRO no Push: ${e.message}\n`);
        setBuildStatus('idle');
        setIsEternalMode(false);
    } finally {
        setIsCommitting(false);
    }
  };

  // 2. Monitoramento
  const pollBuildStatus = async () => {
      if (!settings.github) return;
      
      let attempts = 0;
      const pollInterval = setInterval(async () => {
          attempts++;
          try {
             const run = await getLatestWorkflowRun(settings.github!);
             
             if (run) {
                 if (run.status === 'completed') {
                     clearInterval(pollInterval);
                     setBuildLogs(prev => prev + `> Build ${run.conclusion.toUpperCase()}\n`);
                     
                     if (run.conclusion === 'success') {
                         setBuildStatus('success');
                         setBuildLogs(prev => prev + `> ✅ SUCESSO! Buscando JAR...\n`);
                         setIsEternalMode(false); // Stop loop on success
                         const url = await getBuildArtifact(settings.github!, run.id);
                         if (url) setArtifactUrl(url);
                     } else {
                         setBuildStatus('failure');
                         setBuildLogs(prev => prev + `> ❌ Falha detectada.\n`);
                         
                         // AUTO TRIGGER FIX IF ETERNAL MODE
                         if (isEternalMode) {
                             handleAutoFix();
                         }
                     }
                 } else {
                     setBuildStatus('in_progress');
                     if (attempts % 5 === 0) {
                         setBuildLogs(prev => prev + `> Compilando... (${run.status})\n`);
                     }
                 }
             }
          } catch (e) { console.error(e); }

          if (attempts > 180) { // 6 minutes timeout
              clearInterval(pollInterval);
              setBuildLogs(prev => prev + `> Timeout no GitHub Actions.\n`);
              setIsEternalMode(false);
          }
      }, 3000);
  };

  // 3. Auto Fix & Loop
  const handleAutoFix = async () => {
      if (!project || !buildLogs) return;
      
      setIsFixing(true);
      setFixAttempt(prev => prev + 1);
      setBuildLogs(prev => prev + `\n> 🧠 IA: Analisando erros e aplicando correções automáticas...\n`);
      
      try {
          const relevantLogs = buildLogs.slice(-3000); // More context for better fix
          const fixedProject = await fixPluginCode(project, relevantLogs, settings);
          
          if (onProjectUpdate) {
              onProjectUpdate(fixedProject);
          }
          
          setBuildLogs(prev => prev + `> 🧠 IA: Correções prontas. Iniciando novo build automático...\n`);
          
          // Re-trigger commit and push
          setTimeout(() => {
              handleCommitAndPush(true);
          }, 1000);
          
      } catch (e: any) {
          setBuildLogs(prev => prev + `> 🧠 IA Erro Crítico: ${e.message}\n`);
          setIsEternalMode(false);
      } finally {
          setIsFixing(false);
      }
  };

  const toggleEternalMode = () => {
      if (!isEternalMode) {
          setIsEternalMode(true);
          setFixAttempt(1);
          setBuildLogs(prev => prev + "\n> ♾️ MODO ETERNO ATIVADO: A IA tentará corrigir e buildar até conseguir.\n");
          if (buildStatus === 'failure' || buildStatus === 'idle') {
              handleCommitAndPush();
          }
      } else {
          setIsEternalMode(false);
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
    if (!project) return;
    const zip = new JSZip();
    project.files.forEach(file => zip.file(file.path, file.content));
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
                         <button onClick={() => { setShowConsole(true); handleCommitAndPush(); }} disabled={!settings.github?.isConnected || isFixing} className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${buildStatus === 'in_progress' ? 'text-yellow-400' : buildStatus === 'failure' ? 'text-red-400' : 'text-gray-300 hover:bg-gray-700'}`}>
                            {buildStatus === 'in_progress' ? <RefreshCw className="w-3 h-3 animate-spin"/> : <PlayCircle className="w-3 h-3" />}
                            <span className="hidden xl:inline">{buildStatus === 'in_progress' ? 'Compilando...' : 'Build Maven'}</span>
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
            {project.files.map((file, index) => {
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
        <div className={`absolute bottom-0 left-0 right-0 z-20 border-t border-gray-700 bg-gray-950/95 backdrop-blur-md flex flex-col shadow-2xl transition-all duration-300 h-64`}>
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-700 h-10 shrink-0">
            <div className="flex items-center gap-3 text-xs font-mono">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-gray-300">Terminal: Maven Logs</span>
              
              {isEternalMode && (
                  <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded animate-pulse">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span className="text-purple-300 text-[10px] font-bold">ETERNAL MODE ACTIVE (Round {fixAttempt})</span>
                  </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={toggleEternalMode}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all border ${isEternalMode ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-purple-500/20 border-purple-500/50 text-purple-300 hover:bg-purple-500/40'}`}
              >
                 {isEternalMode ? <><StopCircle className="w-3 h-3" /> Parar Loop</> : <><RotateCcw className="w-3 h-3" /> Loop de Auto-Correção</>}
              </button>
              
              <button onClick={() => setShowConsole(false)} className="text-gray-400 hover:text-white">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] text-gray-300 custom-scrollbar">
            <pre className="whitespace-pre-wrap">{buildLogs || "> Aguardando comandos..."}</pre>
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeViewer;