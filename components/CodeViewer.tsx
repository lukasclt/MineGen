
import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Terminal, Loader2, UploadCloud, ChevronDown, Wrench, Infinity as InfinityIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import { commitAndPushFiles, getLatestWorkflowRun, getWorkflowRunLogs } from '../services/githubService';
import { GITHUB_ACTION_TEMPLATE } from '../constants';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
  onTriggerAutoFix?: (logs: string) => void;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings, onProjectUpdate, onTriggerAutoFix }) => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [isCommitting, setIsCommitting] = useState(false);
  const [autoFixEterno, setAutoFixEterno] = useState(false);
  const [fixCount, setFixCount] = useState(0);
  
  const [buildStatus, setBuildStatus] = useState<'idle' | 'queued' | 'in_progress' | 'success' | 'failure'>('idle');
  const [buildLogs, setBuildLogs] = useState<string>("");
  const [showConsole, setShowConsole] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [lastRunId, setLastRunId] = useState<number | null>(null);
  
  const buildInProgressRef = useRef(false);
  const isFixingInProgressRef = useRef(false);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const selectedFile = project?.files.find(f => f.path === selectedFilePath) || null;

  // Ciclo Eterno: Se o projeto mudar após um fix e o Eterno estiver ligado, faz Push automático
  useEffect(() => {
    if (isFixingInProgressRef.current && project) {
      isFixingInProgressRef.current = false;
      if (autoFixEterno) {
        console.log("Ciclo Eterno: Reiniciando build após correção...");
        setTimeout(() => handleCommitAndPush(true), 1500);
      }
    }
  }, [project]);

  useEffect(() => {
    if (project && project.files.length > 0) {
      if (!selectedFilePath || !project.files.some(f => f.path === selectedFilePath)) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFilePath(mainFile.path);
      }
    }
  }, [project]);

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
    if (!settings.github?.isConnected || !project || buildInProgressRef.current) return;
    
    buildInProgressRef.current = true;
    const workflowPath = ".github/workflows/build.yml";
    const workflowContent = GITHUB_ACTION_TEMPLATE(settings.javaVersion);
    
    let filesToPush = [...project.files];
    const workflowIndex = filesToPush.findIndex(f => f.path === workflowPath);
    if (workflowIndex >= 0) filesToPush[workflowIndex] = { ...filesToPush[workflowIndex], content: workflowContent };
    else filesToPush.push({ path: workflowPath, content: workflowContent, language: 'yaml' });

    setIsCommitting(true);
    setBuildProgress(0);
    if (!silent) setShowConsole(true);
    setBuildLogs(prev => prev + `\n> 🚀 [BUILD #${fixCount + 1}] Iniciando build...\n`);
    setBuildStatus('queued');

    try {
        await commitAndPushFiles(settings.github!, filesToPush, `Build Ciclo #${fixCount + 1}`);
        setBuildLogs(prev => prev + `> Arquivos enviados. Aguardando processamento do Runner...\n`);
        pollBuildStatus();
    } catch (e: any) {
        setBuildLogs(prev => prev + `> 🛑 ERRO no Push: ${e.message}\n`);
        setBuildStatus('idle');
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
          if (progressSim < 90) {
              progressSim += 1.5;
              setBuildProgress(Math.round(progressSim));
          }

          try {
             const run = await getLatestWorkflowRun(settings.github!);
             if (run) {
                 setLastRunId(run.id);
                 if (run.status === 'completed') {
                     clearInterval(pollInterval);
                     setBuildProgress(100);
                     buildInProgressRef.current = false;
                     
                     if (run.conclusion === 'success') {
                         setBuildStatus('success');
                         setBuildLogs(prev => prev + `> ✅ SUCESSO: Build concluído!\n`);
                         setFixCount(0);
                         isFixingInProgressRef.current = false;
                     } else {
                         setBuildStatus('failure');
                         setBuildLogs(prev => prev + `> ❌ FALHA: O build falhou. Iniciando Auto-Fix...\n`);
                         handleAutoFix();
                     }
                 } else {
                     setBuildStatus('in_progress');
                 }
             }
          } catch (e) { console.error(e); }

          if (attempts > 120) {
              clearInterval(pollInterval);
              setBuildLogs(prev => prev + `> 🛑 TIMEOUT: Runner demorou demais.\n`);
              buildInProgressRef.current = false;
          }
      }, 5000);
  };

  const handleAutoFix = async () => {
    if (!project || !lastRunId || !settings.github || !onTriggerAutoFix) return;
    
    try {
        const realLogs = await getWorkflowRunLogs(settings.github, lastRunId);
        const errorLines = realLogs.split('\n').filter(line => line.includes('[ERROR]') || line.includes('Compilation failure'));
        const contextLogs = errorLines.length > 0 ? errorLines.join('\n') : realLogs.substring(Math.max(0, realLogs.length - 3000));
        
        isFixingInProgressRef.current = true;
        setFixCount(prev => prev + 1);
        onTriggerAutoFix(contextLogs);
    } catch (e: any) {
        setBuildLogs(prev => prev + `> ⚠️ Falha ao ler logs: ${e.message}\n`);
        isFixingInProgressRef.current = false;
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
    a.download = `${settings.name}-src.zip`;
    a.click();
  };

  if (!project) return <div className="flex-1 flex flex-col items-center justify-center text-gray-500 h-full p-8 text-center border-l border-gray-800"><FileCode className="w-16 h-16 mb-4 opacity-20" /><p className="text-lg font-medium">Crie um plugin para ver o código</p></div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] border-l border-gray-800 overflow-hidden relative">
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526] shrink-0">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name}
            </h3>
            
            <div className="flex items-center gap-2">
                 <div className="flex items-center bg-black/40 rounded-lg p-0.5 border border-gray-700 mr-2">
                    <button 
                      onClick={() => handleCommitAndPush()} 
                      disabled={isCommitting || !settings.github?.isConnected} 
                      className={`text-xs px-4 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${!settings.github?.isConnected ? 'opacity-50 text-gray-500' : 'text-mc-accent hover:bg-mc-accent/10'}`}
                    >
                        {isCommitting ? <Loader2 className="w-3 h-3 animate-spin"/> : <UploadCloud className="w-3 h-3" />}
                        <span>Push {fixCount > 0 ? `(${fixCount})` : ''}</span>
                    </button>
                    
                    <div className="w-[1px] h-4 bg-gray-700 mx-1"></div>
                    
                    <button 
                      onClick={() => setAutoFixEterno(!autoFixEterno)} 
                      className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-2 transition-all font-semibold ${autoFixEterno ? 'text-mc-gold bg-mc-gold/10' : 'text-gray-500 hover:text-gray-300'}`}
                      title="Auto-Fix Eterno: Ciclo infinito de correção e build"
                    >
                        <InfinityIcon className={`w-3 h-3 ${autoFixEterno ? 'animate-pulse' : ''}`} />
                        <span className="hidden lg:inline">{autoFixEterno ? 'Eterno: ON' : 'Modo Eterno'}</span>
                    </button>
                 </div>

                <button onClick={handleDownloadSource} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 font-semibold px-3 py-1.5 rounded flex items-center gap-2 transition-colors">
                    <Download className="w-3 h-3" /> Fonte
                </button>
            </div>
        </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-56 bg-[#252526]/50 border-r border-gray-700 overflow-y-auto shrink-0 custom-scrollbar">
          <div className="py-2">
            {project?.files.map((file, index) => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFilePath === file.path;
               return (
                <motion.button 
                  key={file.path} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => setSelectedFilePath(file.path)} 
                  className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 truncate ${isSelected ? 'bg-[#37373d] text-white border-l-2 border-mc-accent' : 'text-gray-400 border-l-2 border-transparent hover:bg-white/5'}`}
                >
                    <FileCode className={`w-3.5 h-3.5 ${file.language === 'java' ? 'text-orange-400' : 'text-blue-400'}`} />
                    <span className="truncate">{fileName}</span>
                </motion.button>
               )
            })}
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-w-0 bg-black/20">
            <AnimatePresence mode="wait">
              {selectedFile ? (
                  <motion.div 
                    key={selectedFile.path + "-" + selectedFile.content.length}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col h-full"
                  >
                      <div className="h-8 flex items-center justify-between px-4 bg-black/20 border-b border-gray-800 shrink-0">
                          <span className="text-[10px] text-gray-500 font-mono">{selectedFile.path}</span>
                          <button onClick={handleCopy} className="text-gray-500 hover:text-white transition-colors">
                            {copied ? <Check className="w-3 h-3 text-mc-green" /> : <Copy className="w-3 h-3" />}
                          </button>
                      </div>
                      <div className="flex-1 overflow-auto p-4 custom-scrollbar font-mono text-sm leading-relaxed text-gray-300">
                          <pre className="whitespace-pre select-text"><code>{selectedFile.content}</code></pre>
                      </div>
                  </motion.div>
              ) : (
                  <div className="flex items-center justify-center h-full text-gray-600 text-xs italic">Selecione um arquivo</div>
              )}
            </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {showConsole && (
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: 240 }}
            exit={{ height: 0 }}
            className="border-t border-gray-700 bg-[#0f0f0f] flex flex-col shadow-2xl z-20"
          >
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 border-b border-gray-800 h-9 shrink-0">
              <div className="flex items-center gap-3 text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                <Terminal className="w-3 h-3" />
                <span>Console Maven</span>
                {buildStatus === 'in_progress' && <span className="text-mc-accent animate-pulse">Building {buildProgress}%</span>}
                {isFixingInProgressRef.current && <span className="text-red-400 animate-pulse">Auto-Fixing...</span>}
              </div>
              <button onClick={() => setShowConsole(false)} className="text-gray-500 hover:text-white"><ChevronDown className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-gray-400 custom-scrollbar leading-tight bg-black/40">
              <pre className="whitespace-pre-wrap">{buildLogs || "> Aguardando build..."}</pre>
              <div ref={consoleEndRef} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CodeViewer;
