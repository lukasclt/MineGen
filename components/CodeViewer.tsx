import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Play, Terminal, XCircle, CheckCircle2, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';
import { simulateGradleBuild, fixPluginCode } from '../services/geminiService';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
}

const MAX_RETRIES = 5; // Limite de tentativas de correção automática

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings, onProjectUpdate }) => {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Build State
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [buildLogs, setBuildLogs] = useState<string>("");
  const [showConsole, setShowConsole] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project && project.files.length > 0) {
      // Se o arquivo selecionado ainda existir no novo projeto, mantém. Senão, vai pro Main.
      const currentPath = selectedFile?.path;
      const fileExists = project.files.find(f => f.path === currentPath);
      
      if (!selectedFile || !fileExists) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFile(mainFile);
      } else {
          // Atualiza o conteúdo do arquivo selecionado
          setSelectedFile(fileExists);
      }

      if (buildStatus === 'idle') {
          // Reset logs only if not in the middle of a build process loop
          // (Handled by handleBuild logic)
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

  const handleDownload = async () => {
    if (!project) return;
    
    const zip = new JSZip();
    project.files.forEach(file => {
        zip.file(file.path, file.content);
    });
    
    // Add dummy gradlew scripts
    zip.file("gradlew", "#!/bin/sh\n# Dummy gradlew for structure. Please run 'gradle wrapper' locally.");
    zip.file("gradlew.bat", "@rem Dummy gradlew for structure. Please run 'gradle wrapper' locally.");

    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settings.name}-gradle.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBuildAndAutoFix = async () => {
    if (!project) return;
    
    setIsBuilding(true);
    setBuildStatus('idle');
    setBuildLogs("> Initializing Gradle Daemon...\n> Configuring project...\n");
    setShowConsole(true);
    setRetryCount(0);

    let currentProjectState = project;
    let attempt = 0;
    let success = false;

    // Loop de tentativas (Compile -> Error -> Fix -> Compile...)
    while (attempt < MAX_RETRIES && !success) {
         setRetryCount(attempt + 1);
         setBuildLogs(prev => prev + `\n> [Attempt ${attempt + 1}/${MAX_RETRIES}] Executing Gradle Build...`);

         // Pequeno delay para UX
         await new Promise(r => setTimeout(r, 1000));

         try {
             // 1. Simula Build
             const result = await simulateGradleBuild(currentProjectState, settings);

             if (result.success) {
                 success = true;
                 setBuildLogs(prev => prev + result.logs + `\n\n> BUILD SUCCESSFUL!`);
                 setBuildStatus('success');
             } else {
                 setBuildLogs(prev => prev + result.logs + `\n> Build Failed.`);

                 // Se não for a última tentativa, tenta corrigir
                 if (attempt < MAX_RETRIES - 1) {
                     setBuildLogs(prev => prev + `\n> -----------------------------------\n> DETECTED ERRORS. INITIALIZING AUTO-FIX AGENT...\n> Analyzing code and logs...`);

                     try {
                         // 2. Tenta Corrigir
                         const fixedProject = await fixPluginCode(currentProjectState, result.logs, settings);
                         
                         // Atualiza estado local e global
                         currentProjectState = fixedProject;
                         if (onProjectUpdate) onProjectUpdate(fixedProject);

                         setBuildLogs(prev => prev + `\n> Fix applied successfully.\n> Reloading files and retrying build...\n> -----------------------------------\n`);
                     } catch (fixError: any) {
                         setBuildLogs(prev => prev + `\n> CRITICAL: Auto-Fix failed to generate a response: ${fixError.message}\n> Stopping process.`);
                         break; // Sai do loop se a IA de fix falhar
                     }
                 } else {
                     setBuildLogs(prev => prev + `\n\n> Max retries (${MAX_RETRIES}) reached. Auto-fix could not resolve all errors.`);
                     setBuildStatus('error');
                 }
             }
         } catch (err: any) {
             setBuildStatus('error');
             setBuildLogs(prev => prev + `\n> System Error: ${err.message}`);
             break;
         }

         attempt++;
    }

    setIsBuilding(false);
  };

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 text-gray-500 h-full p-8 text-center border-l border-gray-800">
        <FileCode className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">No Code Generated Yet</p>
        <p className="text-sm max-w-md mt-2">Start chatting to generate a Gradle project. Your generated files will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] border-l border-gray-800 overflow-hidden relative">
        {/* Header */}
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526] shrink-0">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name} <span className="text-gray-500 text-xs">(Gradle)</span>
            </h3>
            <div className="flex items-center gap-2">
                <button 
                  onClick={handleDownload}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded flex items-center gap-2 transition-colors border border-gray-600"
                  title="Download Project ZIP"
                >
                    <Download className="w-3 h-3" /> Zip
                </button>
                <button 
                  onClick={handleBuildAndAutoFix}
                  disabled={isBuilding}
                  className={`text-xs px-3 py-1.5 rounded flex items-center gap-2 transition-colors font-semibold border
                    ${isBuilding 
                      ? 'bg-purple-900/50 text-purple-200 border-purple-700 cursor-wait' 
                      : 'bg-[#21262d] text-white border-gray-600 hover:bg-[#30363d] hover:border-gray-500'}`}
                >
                    {isBuilding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-green-500" />}
                    {isBuilding ? `Auto-Fixing (${retryCount}/${MAX_RETRIES})...` : 'Build & Auto-Fix'}
                </button>
            </div>
        </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-60 bg-[#252526] border-r border-gray-700 overflow-y-auto flex-shrink-0 custom-scrollbar">
          <div className="py-2">
            {project.files.map((file, index) => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFile?.path === file.path;
               // Simple icon logic
               let iconColor = 'text-gray-400';
               if (fileName?.endsWith('.java')) iconColor = 'text-orange-400';
               else if (fileName?.endsWith('.gradle')) iconColor = 'text-blue-400';
               else if (fileName?.endsWith('.yml') || fileName?.endsWith('.json')) iconColor = 'text-yellow-400';

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
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e]">
            {selectedFile ? (
                <>
                    <div className="h-9 flex items-center justify-between px-4 bg-[#1e1e1e] border-b border-gray-800 shrink-0">
                        <span className="text-xs text-gray-400 font-mono">{selectedFile.path}</span>
                        <button 
                            onClick={handleCopy}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Copy Code"
                        >
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
                <div className="flex items-center justify-center h-full text-gray-500">
                    Select a file to view content
                </div>
            )}
        </div>
      </div>

      {/* Build Console / Terminal */}
      {showConsole && (
        <div className={`border-t border-gray-700 bg-black flex flex-col transition-all duration-300 ease-in-out ${buildStatus !== 'idle' ? 'h-72' : 'h-48'}`}>
          <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-700 h-10 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-gray-300">Run: ./gradlew build</span>
              {isBuilding && (
                  <span className="text-purple-400 ml-2 flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Attempt {retryCount}/{MAX_RETRIES} (Auto-Fix Active)
                  </span>
              )}
              {!isBuilding && buildStatus === 'success' && <span className="text-green-500 ml-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Build Success</span>}
              {!isBuilding && buildStatus === 'error' && <span className="text-red-500 ml-2 flex items-center gap-1"><XCircle className="w-3 h-3"/> Build Failed (Max Retries)</span>}
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => setShowConsole(false)} className="text-gray-400 hover:text-white">
                <div className="w-4 h-1 bg-gray-500 rounded-full"></div>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-gray-300 custom-scrollbar">
            <pre className="whitespace-pre-wrap font-mono">
              {buildLogs}
            </pre>
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeViewer;