import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Terminal, XCircle, CheckCircle2, RefreshCw, Hammer, Bug, ChevronDown, ChevronUp, Cloud, Github, UploadCloud, PlayCircle, Loader2, ArrowUpCircle, Sparkles, Wand2, StopCircle, RotateCcw } from 'lucide-react';
import JSZip from 'jszip';
import { commitAndPushFiles, getLatestWorkflowRun, getBuildArtifact, downloadArtifact } from '../services/githubService';
import { GITHUB_ACTION_TEMPLATE } from '../constants';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
  isEternalMode: boolean;
  setIsEternalMode: (val: boolean) => void;
  onBuildFailure: (logs: string) => void;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ 
  project, settings, onProjectUpdate, 
  isEternalMode, setIsEternalMode, onBuildFailure 
}) => {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);
  
  // GitHub / Build State
  const [isCommitting, setIsCommitting] = useState(false);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'queued' | 'in_progress' | 'success' | 'failure'>('idle');
  const [buildLogs, setBuildLogs] = useState<string>("");
  const [showConsole, setShowConsole] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null);
  const [buildProgress, setBuildProgress] = useState(0);
  
  // Internal tracking to avoid loops
  const lastBuiltProjectRef = useRef<string | null>(null);
  const buildInProgressRef = useRef(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project && project.files.length > 0) {
      const currentPath = selectedFile?.path;
      const fileExists = project.files.find(f => f.path === currentPath);
      if (!selectedFile || !fileExists) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFile(mainFile);
      } else if (fileExists.content !== selectedFile?.content) {
          setSelectedFile(fileExists);
      }

      // AUTO BUILD IN ETERNAL MODE
      const projectHash = JSON.stringify(project.files);
      if (isEternalMode && projectHash !== lastBuiltProjectRef.current && !buildInProgressRef.current) {
         handleCommitAndPush(true);
      }
    }
  }, [project, isEternalMode]);

  useEffect(() => {
    if (showConsole) {
      setTimeout(() => {
        consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [buildLogs, showConsole]);

  const handleCopy = () => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCommitAndPush = async (silent = false) => {
    if (!settings.github?.isConnected || !project || buildInProgressRef.current) {
        if (!silent && !settings.github?.isConnected) alert("GitHub não conectado.");
        return;
    }
    
    buildInProgressRef.current = true;
    const projectHash = JSON.stringify(project.files);
    lastBuiltProjectRef.current = projectHash;

    const workflowPath = ".github/workflows/build.yml";
    const workflowContent = GITHUB_ACTION_TEMPLATE(settings.javaVersion);
    
    let filesToPush = [...project.files];
    const workflowIndex = filesToPush.findIndex(f => f.path === workflowPath);
    if (workflowIndex >= 0) filesToPush[workflowIndex] = { ...filesToPush[workflowIndex], content: workflowContent };
    else filesToPush.push({ path: workflowPath, content: workflowContent, language: 'yaml' });

    if (onProjectUpdate) onProjectUpdate({ ...project, files: filesToPush });

    setIsCommitting(true);
    setBuildProgress(0);
    if (!silent) setShowConsole(true);
    setBuildLogs(prev => prev + `\n> Enviando código para GitHub (Java ${settings.javaVersion})...\n`);
    setBuildStatus('queued');

    try {
        await commitAndPushFiles(settings.github!, filesToPush, `Build trigger`);
        setBuildLogs(prev => prev + `> Arquivos enviados. Iniciando build no Maven Cloud...\n`);
        pollBuildStatus();
    } catch (e: any) {
        setBuildLogs(prev => prev + `> 🛑 ERRO no Push: ${e.message}\n`);
        setBuildStatus('idle');
        setIsEternalMode(false);
        buildInProgressRef.current = false;
    } finally {
        setIsCommitting(false);
    }
  };

  const pollBuildStatus = async () => {
      if (!settings.github) return;
      let attempts = 0;
      let progressSim = 5;
      
      const pollInterval = setInterval(async () => {
          attempts++;
          if (progressSim < 95) {
              progressSim += 1 + (Math.random() * 2);
              setBuildProgress(Math.min(99, Math.round(progressSim)));
          }

          try {
             const run = await getLatestWorkflowRun(settings.github!);
             if (run) {
                 if (run.status === 'completed') {
                     clearInterval(pollInterval);
                     setBuildProgress(100);
                     setBuildLogs(prev => prev + `> Build concluído: ${run.conclusion.toUpperCase()}\n`);
                     buildInProgressRef.current = false;
                     
                     if (run.conclusion === 'success') {
                         setBuildStatus('success');
                         setBuildLogs(prev => prev + `> ✅ SUCESSO! JAR gerado e pronto.\n`);
                         setIsEternalMode(false);
                         const url = await getBuildArtifact(settings.github!, run.id);
                         if (url) setArtifactUrl(url);
                     } else {
                         setBuildStatus('failure');
                         setBuildLogs(prev => prev + `> ❌ Falha detectada no Maven.\n`);
                         if (isEternalMode) {
                            setBuildLogs(prev => prev + `> 🔄 MODO ETERNO: Solicitando correção via Chat...\n`);
                            onBuildFailure(buildLogs + "\n" + (run.conclusion_message || "Maven compilation failed. Check pom.xml and syntax."));
                         }
                     }
                 } else {
                     setBuildStatus('in_progress');
                     if (attempts % 3 === 0) setBuildLogs(prev => prev + `> Compilando... [${Math.round(progressSim)}%]\n`);
                 }
             }
          } catch (e) { console.error(e); }

          if (attempts > 180) {
              clearInterval(pollInterval);
              setBuildLogs(prev => prev + `> 🛑 Timeout no build.\n`);
              setIsEternalMode(false);
              buildInProgressRef.current = false;
          }
      }, 3000);
  };

  const handleDownloadArtifact = async () => {
      if (!artifactUrl || !settings.github) return;
      try { await downloadArtifact(settings.github.token, artifactUrl, `${settings.name}-build.zip`); }
      catch (e: any) { alert("Erro ao baixar: " + e.message); }
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

  if (!project) return <div className="flex-1 flex flex-col items-center justify-center text-gray-500 h-full p-8 text-center border-l border-gray-800"><FileCode className="w-16 h-16 mb-4 opacity-20" /><p className="text-lg font-medium">Nenhum Código Gerado</p></div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]/95 backdrop-blur-sm border-l border-gray-800 overflow-hidden relative">
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526]/90 shrink-0">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name} <span className="text-gray-500 text-xs">({settings.version})</span>
            </h3>
            
            <div className="flex items-center gap-2">
                 <div className="flex items-center bg-black/30 rounded-lg p-0.5 border border-gray-700 mr-2">
                    <button onClick={() => handleCommitAndPush()} disabled={isCommitting || !settings.github?.isConnected} className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${!settings.github?.isConnected ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>
                        {isCommitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <UploadCloud className="w-3 h-3" />}
                        <span className="hidden xl:inline">Commit & Push</span>
                    </button>
                    <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>
                    {buildStatus === 'success' && artifactUrl ? (
                         <button onClick={handleDownloadArtifact} className="text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold bg-green-500/20 text-green-300 hover:bg-green-500/30 animate-pulse">
                            <Download className="w-3 h-3" /> <span>Download JAR</span>
                         </button>
                    ) : (
                         <button onClick={() => { setShowConsole(true); handleCommitAndPush(); }} disabled={!settings.github?.isConnected} className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${buildStatus === 'in_progress' || buildStatus === 'queued' ? 'text-yellow-400' : buildStatus === 'failure' ? 'text-red-400' : 'text-gray-300 hover:bg-gray-700'}`}>
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
                        <button onClick={handleCopy} className="text-gray-400 hover:text-white transition-colors"><Copy className="w-4 h-4" /></button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        <pre className="font-mono text-sm text-gray-300 leading-relaxed"><code>{selectedFile.content}</code></pre>
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
              {(buildStatus === 'in_progress' || buildStatus === 'queued') && <span className="text-yellow-400 font-bold ml-2">Progress: {buildProgress}%</span>}
              {isEternalMode && (
                  <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded animate-pulse">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span className="text-purple-300 text-[10px] font-bold uppercase tracking-wider">Eternal Mode Active</span>
                  </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsEternalMode(!isEternalMode)} className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all border ${isEternalMode ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-purple-500/20 border-purple-500/50 text-purple-300 hover:bg-purple-500/40'}`}>
                 {isEternalMode ? <><StopCircle className="w-3 h-3" /> Parar Loop</> : <><RotateCcw className="w-3 h-3" /> Auto-Fix Loop</>}
              </button>
              <button onClick={() => setShowConsole(false)} className="text-gray-400 hover:text-white"><ChevronDown className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-gray-300 custom-scrollbar bg-black/40">
            <pre className="whitespace-pre-wrap">{buildLogs || "> Pronto para build Maven..."}</pre>
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeViewer;