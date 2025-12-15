import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Play, Terminal, XCircle, CheckCircle2, Loader2, RefreshCw, Hammer, Bug } from 'lucide-react';
import JSZip from 'jszip';
import { simulateGradleBuild, fixPluginCode } from '../services/geminiService';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
}

const MAX_RETRIES = 3;

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings, onProjectUpdate }) => {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Build Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [buildLogs, setBuildLogs] = useState<string>("");
  const [showConsole, setShowConsole] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (project && project.files.length > 0) {
      const currentPath = selectedFile?.path;
      const fileExists = project.files.find(f => f.path === currentPath);
      
      if (!selectedFile || !fileExists) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFile(mainFile);
      } else {
          // Verify if content changed (e.g. after auto-fix)
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

  const handleDownloadSource = async () => {
    if (!project) return;
    const zip = new JSZip();
    
    // Full Gradle Project Structure
    project.files.forEach(file => {
        zip.file(file.path, file.content);
    });
    
    // Add Gradle Wrapper Scripts
    zip.file("gradlew", `#!/bin/sh\n# Gradle Wrapper Script\nexec gradle "$@"\n`);
    zip.file("gradlew.bat", `@if "%DEBUG%" == "" @echo off\ngradle %*\n`);
    
    // Add README
    zip.file("README.md", 
`# ${settings.name}

Gerado por MineGen AI.

## Como Compilar (Build)
1. Certifique-se de ter o Java ${settings.javaVersion} instalado.
2. Abra o terminal nesta pasta.
3. Execute o comando de build:

   **Windows:**
   \`\`\`
   gradlew.bat build
   \`\`\`

   **Linux/Mac:**
   \`\`\`
   chmod +x gradlew
   ./gradlew build
   \`\`\`

4. O JAR do seu plugin estará em \`build/libs/\`.
`);
    
    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settings.name}-source.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTestBuild = async () => {
    if (!project) return;
    
    setIsTesting(true);
    setTestStatus('idle');
    setBuildLogs(`> Inicializando Ambiente Virtual de Build...\n> Verificando estrutura do projeto '${settings.name}'...\n> Task :compileJava\n`);
    setShowConsole(true);
    setRetryCount(0);

    let currentProjectState = project;
    let attempt = 0;
    let success = false;

    while (attempt <= MAX_RETRIES && !success) {
         setRetryCount(attempt);
         
         if (attempt > 0) {
            setBuildLogs(prev => prev + `\n> Compilação FALHOU.\n> Aplicando Auto-Correção IA (Tentativa ${attempt}/${MAX_RETRIES})...\n`);
         }
         
         // Small delay for UX
         await new Promise(r => setTimeout(r, 800));

         try {
             // 1. Simulate Build / Verify Code
             const result = await simulateGradleBuild(currentProjectState, settings);

             if (result.success) {
                 success = true;
                 setBuildLogs(prev => prev + result.logs + `\n> Task :processResources\n> Task :classes\n> Task :jar\n> Task :assemble\n> Task :build\n\nBUILD SUCCESSFUL\nTodas as verificações passaram. Código fonte válido.`);
                 setTestStatus('success');
             } else {
                 setBuildLogs(prev => prev + result.logs);

                 // 2. If failed and we have retries left, AUTO-FIX
                 if (attempt < MAX_RETRIES) {
                     setBuildLogs(prev => prev + `\n> Analisando erros para correção automática...\n`);
                     
                     try {
                         const fixedProject = await fixPluginCode(currentProjectState, result.logs, settings);
                         currentProjectState = fixedProject;
                         
                         // Update the project in the main state so the user sees the changes immediately
                         if (onProjectUpdate) onProjectUpdate(fixedProject);

                         setBuildLogs(prev => prev + `> Patches aplicados. Recompilando...\n--------------------------------------------------\n`);
                     } catch (fixError: any) {
                         setBuildLogs(prev => prev + `\n> Erro Crítico na auto-correção: ${fixError.message}`);
                         break;
                     }
                 } else {
                     setBuildLogs(prev => prev + `\n\nBUILD FAILED\nLimite de tentativas de auto-correção atingido. Por favor, revise o código manualmente.`);
                     setTestStatus('error');
                 }
             }
         } catch (err: any) {
             setTestStatus('error');
             setBuildLogs(prev => prev + `\n> Erro no Sistema: ${err.message}`);
             break;
         }
         attempt++;
    }
    setIsTesting(false);
  };

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 text-gray-500 h-full p-8 text-center border-l border-gray-800">
        <FileCode className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">Nenhum Código Gerado Ainda</p>
        <p className="text-sm max-w-md mt-2">Comece a conversar para gerar a estrutura do projeto Gradle.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] border-l border-gray-800 overflow-hidden relative">
        {/* Header */}
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526] shrink-0">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name} <span className="text-gray-500 text-xs">({settings.version})</span>
            </h3>
            
            <div className="flex items-center gap-2">
                 {/* Test Build Button */}
                 <button 
                  onClick={handleTestBuild}
                  disabled={isTesting}
                  className={`text-xs px-4 py-1.5 rounded flex items-center gap-2 transition-colors font-semibold border
                    ${isTesting 
                      ? 'bg-purple-900/50 text-purple-200 border-purple-700 cursor-wait' 
                      : testStatus === 'error' 
                        ? 'bg-red-900/30 text-red-200 border-red-800 hover:bg-red-900/50'
                        : testStatus === 'success'
                          ? 'bg-green-900/30 text-green-200 border-green-800 hover:bg-green-900/50'
                          : 'bg-mc-panel text-white border-gray-600 hover:bg-gray-700'}`}
                  title="Executar verificação do compilador IA e Auto-Corretor"
                >
                    {isTesting ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        {retryCount > 0 ? `Corrigindo (${retryCount}/${MAX_RETRIES})...` : 'Verificando...'}
                      </>
                    ) : (
                      <>
                        {testStatus === 'error' ? <Bug className="w-3 h-3" /> : (testStatus === 'success' ? <CheckCircle2 className="w-3 h-3" /> : <Hammer className="w-3 h-3" />)}
                        {testStatus === 'error' ? 'Tentar Novamente' : (testStatus === 'success' ? 'Verificado' : 'Testar Build')}
                      </>
                    )}
                </button>

                <button 
                  onClick={handleDownloadSource}
                  className="text-xs bg-mc-accent hover:bg-blue-600 text-white font-semibold px-4 py-1.5 rounded flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                  title="Baixar Código Fonte do Projeto (ZIP)"
                >
                    <Download className="w-3 h-3" /> Baixar Source
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
                        <div className="flex items-center gap-3">
                           {testStatus === 'success' && (
                             <span className="text-[10px] text-green-500 flex items-center gap-1 bg-green-900/20 px-2 py-0.5 rounded border border-green-900/50">
                                <CheckCircle2 className="w-3 h-3" /> Pronto
                             </span>
                          )}
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
                    {testStatus === 'idle' && (
                      <div className="text-xs text-gray-600 max-w-xs text-center border border-gray-800 p-3 rounded">
                         Clique em "Testar Build" para verificar o código.
                      </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Build Console / Terminal */}
      {showConsole && (
        <div className={`border-t border-gray-700 bg-black flex flex-col transition-all duration-300 ease-in-out ${testStatus === 'success' ? 'h-40' : 'h-64'}`}>
          <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-700 h-10 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-gray-300">Run: ./gradlew build --dry-run</span>
              {isTesting && (
                  <span className="text-purple-400 ml-2 flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Auto-Corrigindo...
                  </span>
              )}
              {!isTesting && testStatus === 'success' && <span className="text-green-500 ml-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Verificação Passou</span>}
              {!isTesting && testStatus === 'error' && <span className="text-red-500 ml-2 flex items-center gap-1"><XCircle className="w-3 h-3"/> Verificação Falhou</span>}
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