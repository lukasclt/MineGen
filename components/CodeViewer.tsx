import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Terminal, XCircle, CheckCircle2, RefreshCw, Hammer, Bug, ChevronDown, ChevronUp, Cloud, Github, UploadCloud, PlayCircle, Loader2, ArrowUpCircle, Sparkles, Wand2 } from 'lucide-react';
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
  
  // Auto Fix State
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
          // Verify if content changed
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

  // 2. Commit & Push
  const handleCommitAndPush = async () => {
    if (!settings.github?.isConnected || !project) {
        alert("Por favor, conecte sua conta do GitHub na barra lateral primeiro.");
        return;
    }
    
    // PREPARE FILES: Force update Workflow to ensure valid build command (MAVEN)
    const workflowPath = ".github/workflows/build.yml";
    const workflowContent = GITHUB_ACTION_TEMPLATE(settings.javaVersion);
    
    let filesToPush = [...project.files];
    const workflowIndex = filesToPush.findIndex(f => f.path === workflowPath);
    
    // Upsert the workflow file with the CORRECT content
    if (workflowIndex >= 0) {
        filesToPush[workflowIndex] = { ...filesToPush[workflowIndex], content: workflowContent };
    } else {
        filesToPush.push({ path: workflowPath, content: workflowContent, language: 'yaml' });
    }

    // Update local state so user sees the change
    if (onProjectUpdate) {
        onProjectUpdate({ ...project, files: filesToPush });
    }

    setIsCommitting(true);
    setBuildLogs(prev => prev + `\n> Enviando alterações para o GitHub (Java ${settings.javaVersion})...\n`);
    setShowConsole(true);
    setBuildStatus('queued');

    try {
        await commitAndPushFiles(settings.github!, filesToPush, `Build with Java ${settings.javaVersion} (Maven)`);
        setBuildLogs(prev => prev + `> Arquivos enviados! O GitHub iniciará o build em Java ${settings.javaVersion} em instantes.\n`);
        pollBuildStatus();
    } catch (e: any) {
        setBuildLogs(prev => prev + `> ERRO ao enviar: ${e.message}\n`);
        setBuildStatus('idle');
    } finally {
        setIsCommitting(false);
    }
  };

  // 3. Poll GitHub Actions
  const pollBuildStatus = async () => {
      if (!settings.github) return;
      
      setBuildLogs(prev => prev + `> Monitorando progresso do build...\n`);
      
      let attempts = 0;
      const pollInterval = setInterval(async () => {
          attempts++;
          try {
             const run = await getLatestWorkflowRun(settings.github!);
             
             if (run) {
                 if (run.status === 'completed') {
                     clearInterval(pollInterval);
                     setBuildLogs(prev => prev + `> Build concluído: ${run.conclusion.toUpperCase()}\n`);
                     
                     if (run.conclusion === 'success') {
                         setBuildStatus('success');
                         setBuildLogs(prev => prev + `> Coletando JAR da pasta target/...\n`);
                         const url = await getBuildArtifact(settings.github!, run.id);
                         if (url) {
                            setArtifactUrl(url);
                            setBuildLogs(prev => prev + `> Sucesso! O arquivo JAR está pronto para download.\n`);
                         } else {
                            setBuildLogs(prev => prev + `> Build passou, mas o artefato não foi gerado.\n`);
                         }
                     } else {
                         setBuildStatus('failure');
                         setBuildLogs(prev => prev + `> Ocorreu um erro na compilação. Use o botão "Corrigir Erros" acima.\n`);
                     }
                 } else {
                     setBuildStatus('in_progress');
                     if (attempts % 5 === 0) {
                         setBuildLogs(prev => prev + `> Build em andamento (${run.status})...\n`);
                     }
                 }
             }
          } catch (e) {
              console.error(e);
          }

          if (attempts > 120) {
              clearInterval(pollInterval);
              setBuildLogs(prev => prev + `> Timeout: O build está demorando demais.\n`);
              setBuildStatus('idle');
          }
      }, 2000);
  };

  // 4. Auto Fix
  const handleAutoFix = async () => {
      if (!project || !buildLogs) return;
      
      setIsFixing(true);
      setBuildLogs(prev => prev + `\n> 🧠 IA: Corrigindo erros para Java ${settings.javaVersion}...\n`);
      
      try {
          const relevantLogs = buildLogs.slice(-2000);
          const fixedProject = await fixPluginCode(project, relevantLogs, settings);
          
          if (onProjectUpdate) {
              onProjectUpdate(fixedProject);
          }
          
          setBuildLogs(prev => prev + `> 🧠 IA: Código corrigido! Tente "Commit & Push" novamente.\n`);
          setBuildStatus('idle');
      } catch (e: any) {
          setBuildLogs(prev => prev + `> 🧠 IA Erro: ${e.message}\n`);
      } finally {
          setIsFixing(false);
      }
  };

  // 5. Download Artifact
  const handleDownloadArtifact = async () => {
      if (!artifactUrl || !settings.github) return;
      try {
          await downloadArtifact(settings.github.token, artifactUrl, `${settings.name}-build.zip`);
      } catch (e: any) {
          alert("Erro ao baixar: " + e.message);
      }
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
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-transparent text-gray-500 h-full p-8 text-center border-l border-gray-800">
        <FileCode className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Nenhum Código Gerado Ainda</p>
        <p className="text-sm max-w-md mt-2">Comece a conversar para gerar a estrutura do projeto Maven.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e]/95 backdrop-blur-sm border-l border-gray-800 overflow-hidden relative">
        {/* Header */}
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526]/90 shrink-0">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name} <span className="text-gray-500 text-xs">({settings.version})</span>
            </h3>
            
            <div className="flex items-center gap-2">
                 
                 {/* Main Controls */}
                 <div className="flex items-center bg-black/30 rounded-lg p-0.5 border border-gray-700 mr-2">
                    
                    {/* 1. Commit/Push Button */}
                    <button 
                      onClick={handleCommitAndPush}
                      disabled={isCommitting || !settings.github?.isConnected || isFixing}
                      className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${!settings.github?.isConnected || isFixing ? 'opacity-50 cursor-not-allowed text-gray-500' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
                      title={!settings.github?.isConnected ? "Conecte o GitHub na barra lateral" : "Enviar alterações para o GitHub"}
                    >
                        {isCommitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <UploadCloud className="w-3 h-3" />}
                        <span className="hidden xl:inline">Commit & Push</span>
                    </button>

                    <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>
                    
                    {/* 2. Build Status/Download Button */}
                    {buildStatus === 'success' && artifactUrl ? (
                         <button 
                            onClick={handleDownloadArtifact}
                            className="text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold bg-green-500/20 text-green-300 hover:bg-green-500/30 animate-pulse"
                            title="Baixar JAR Compilado"
                         >
                            <Download className="w-3 h-3" />
                            <span>Download JAR</span>
                         </button>
                    ) : (
                         <button 
                            onClick={() => { setShowConsole(true); if(buildStatus === 'idle') handleCommitAndPush(); }}
                            disabled={!settings.github?.isConnected || isFixing}
                            className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold
                                ${buildStatus === 'in_progress' || buildStatus === 'queued' ? 'text-yellow-400' : 
                                  buildStatus === 'failure' ? 'text-red-400' : 'text-gray-300 hover:bg-gray-700'}`}
                         >
                            {buildStatus === 'in_progress' || buildStatus === 'queued' ? <RefreshCw className="w-3 h-3 animate-spin"/> : <PlayCircle className="w-3 h-3" />}
                            <span className="hidden xl:inline">
                                {buildStatus === 'idle' ? 'Build (Maven Cloud)' : 
                                 buildStatus === 'queued' ? 'Na Fila...' : 
                                 buildStatus === 'in_progress' ? 'Compilando...' : 'Falha'}
                            </span>
                         </button>
                    )}

                    <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>

                    <button
                      onClick={() => setShowConsole(!showConsole)}
                      className={`p-1.5 rounded-md transition-colors ${showConsole ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                      title="Alternar Terminal"
                    >
                      <Terminal className="w-3 h-3" />
                    </button>
                 </div>

                <button 
                  onClick={handleDownloadSource}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold px-3 py-1.5 rounded flex items-center gap-2 transition-colors"
                  title="Baixar Código Fonte (ZIP)"
                >
                    <Download className="w-3 h-3" /> <span className="hidden md:inline">Fonte</span>
                </button>
            </div>
        </div>

      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* File Tree Sidebar */}
        <div className="w-60 bg-[#252526]/80 border-r border-gray-700 overflow-y-auto flex-shrink-0 custom-scrollbar">
          <div className="py-2">
            {project.files.map((file, index) => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFile?.path === file.path;
               let iconColor = 'text-gray-400';
               if (fileName?.endsWith('.java')) iconColor = 'text-orange-400';
               else if (fileName?.endsWith('.xml')) iconColor = 'text-blue-400';
               else if (fileName?.endsWith('.yml') || fileName?.endsWith('.json') || fileName?.endsWith('.yaml')) iconColor = 'text-yellow-400';

               return (
                <button
                    key={index}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 truncate hover:bg-[#2a2d2e] transition-colors ${isSelected ? 'bg-[#37373d] text-white border-l-2 border-mc-accent' : 'text-gray-400 border-l-2 border-transparent'}`}
                >
                    <FileCode className={`w-4 h-4 ${iconColor}`} />
                    <span className="truncate" title={file.path}>{fileName}</span>
                </button>
               )
            })}
          </div>
        </div>

        {/* Code Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-transparent">
            {selectedFile ? (
                <>
                    <div className="h-9 flex items-center justify-between px-4 bg-[#1e1e1e]/50 border-b border-gray-800 shrink-0">
                        <span className="text-xs text-gray-400 font-mono">{selectedFile.path}</span>
                        <div className="flex items-center gap-3">
                          <button 
                              onClick={handleCopy}
                              className="text-gray-400 hover:text-white transition-colors"
                              title="Copiar Código"
                          >
                              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                        <pre className="font-mono text-sm text-gray-300 leading-relaxed">
                            <code>{selectedFile.content}</code>
                        </pre>
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500 flex-col gap-3">
                    <p>Selecione um arquivo para ver o conteúdo</p>
                </div>
            )}
        </div>
      </div>

      {/* Build Console / Terminal - OVERLAY */}
      {showConsole && (
        <div className={`absolute bottom-0 left-0 right-0 z-20 border-t border-gray-700 bg-gray-950/95 backdrop-blur-md flex flex-col shadow-2xl transition-all duration-300 ease-in-out h-64`}>
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-700 h-10 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-gray-300">Terminal: Maven Logs (Java {settings.javaVersion})</span>
              
              {buildStatus === 'in_progress' && <span className="text-yellow-400 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Compilando...</span>}
              {buildStatus === 'success' && <span className="text-green-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Sucesso (JAR gerado)</span>}
              {buildStatus === 'failure' && <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3"/> Erro no Build</span>}
              
              {isFixing && <span className="text-purple-400 flex items-center gap-1"><Wand2 className="w-3 h-3 animate-pulse"/> Corrigindo com IA...</span>}
            </div>
            
            <div className="flex items-center gap-2">
              {/* AUTO FIX BUTTON - Só aparece se falhar */}
              {buildStatus === 'failure' && !isFixing && (
                  <button 
                    onClick={handleAutoFix}
                    className="flex items-center gap-1.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-purple-500/30 transition-all"
                  >
                     <Sparkles className="w-3 h-3" /> Corrigir Erros
                  </button>
              )}
              
              <button onClick={() => setShowConsole(false)} className="text-gray-400 hover:text-white transition-colors">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-gray-300 custom-scrollbar">
            {!settings.github?.isConnected ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                    <p>Conecte o GitHub para ver os logs do Maven.</p>
                </div>
            ) : (
                <>
                    <pre className="whitespace-pre-wrap font-mono">{buildLogs}</pre>
                    <div ref={consoleEndRef} />
                </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeViewer;
