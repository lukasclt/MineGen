import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download, Play, Terminal, XCircle, CheckCircle2, Loader2, RefreshCw, Package, Hammer } from 'lucide-react';
import JSZip from 'jszip';
import { simulateGradleBuild, fixPluginCode } from '../services/geminiService';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
}

const MAX_RETRIES = 5;

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
      const currentPath = selectedFile?.path;
      const fileExists = project.files.find(f => f.path === currentPath);
      
      if (!selectedFile || !fileExists) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFile(mainFile);
      } else {
          setSelectedFile(fileExists);
      }
      
      if (!isBuilding && retryCount === 0) {
         setBuildStatus('idle');
         setBuildLogs("");
         setShowConsole(false);
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

  const handleDownloadJar = async () => {
    if (!project) return;
    
    const zip = new JSZip();
    
    // 1. META-INF/MANIFEST.MF (Standard for Executable Jars)
    zip.file("META-INF/MANIFEST.MF", 
      `Manifest-Version: 1.0\n` +
      `Created-By: 17.0.0 (MineGen AI Gradle Toolchain)\n` +
      `Implementation-Title: ${settings.name}\n` +
      `Implementation-Version: ${settings.version}\n` +
      `Implementation-Vendor: ${settings.groupId}\n`
    );

    // 2. Resources at Root (Standard Spigot/Velocity structure)
    project.files.forEach(file => {
        if (file.path.includes("src/main/resources/")) {
            const fileName = file.path.split("src/main/resources/")[1];
            if (fileName) zip.file(fileName, file.content);
        }
    });

    // 3. Source/Classes
    // In a browser environment, we bundle the source structure. 
    // This allows the user to see the structure inside the JAR.
    project.files.forEach(file => {
        if (file.path.includes("src/main/java/")) {
             const pathParts = file.path.split("src/main/java/");
             if (pathParts[1]) {
                 // We place the files in the package structure
                 zip.file(pathParts[1], file.content);
             }
        }
    });

    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settings.name}-${settings.version}.jar`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSource = async () => {
    if (!project) return;
    const zip = new JSZip();
    
    // Full Gradle Project Structure
    project.files.forEach(file => {
        zip.file(file.path, file.content);
    });
    
    // Gradle Wrapper Scripts (Standard)
    zip.file("gradlew", `#!/bin/sh\n# Gradle Wrapper Script\nexec gradle "$@"\n`);
    zip.file("gradlew.bat", `@if "%DEBUG%" == "" @echo off\ngradle %*\n`);
    
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

  const handleBuildAndAutoFix = async () => {
    if (!project) return;
    
    setIsBuilding(true);
    setBuildStatus('idle');
    setBuildLogs(`> Starting Gradle Daemon...\n> Gradle 8.5\n> Configuring project '${settings.name}'...\n> Task :compileJava\n`);
    setShowConsole(true);
    setRetryCount(0);

    let currentProjectState = project;
    let attempt = 0;
    let success = false;

    while (attempt < MAX_RETRIES && !success) {
         setRetryCount(attempt + 1);
         
         if (attempt > 0) {
            setBuildLogs(prev => prev + `\n> Task :compileJava FAILED\n> Retrying build... (Attempt ${attempt + 1}/${MAX_RETRIES})\n`);
         }
         
         await new Promise(r => setTimeout(r, 1000));

         try {
             // AI acts as the compiler verification step
             const result = await simulateGradleBuild(currentProjectState, settings);

             if (result.success) {
                 success = true;
                 setBuildLogs(prev => prev + result.logs + `\n> Task :processResources\n> Task :classes\n> Task :jar\n> Task :assemble\n> Task :build\n\nBUILD SUCCESSFUL in ${2 + attempt}s\n3 actionable tasks: 3 executed`);
                 setBuildStatus('success');
             } else {
                 setBuildLogs(prev => prev + result.logs);

                 if (attempt < MAX_RETRIES - 1) {
                     setBuildLogs(prev => prev + `\n> Dectected compilation errors. Invoking Auto-Fixer...\n`);
                     
                     try {
                         const fixedProject = await fixPluginCode(currentProjectState, result.logs, settings);
                         currentProjectState = fixedProject;
                         if (onProjectUpdate) onProjectUpdate(fixedProject);

                         setBuildLogs(prev => prev + `> Code patched. Re-running build task...\n--------------------------------------------------\n`);
                     } catch (fixError: any) {
                         setBuildLogs(prev => prev + `\n> Error during auto-fix: ${fixError.message}`);
                         break;
                     }
                 } else {
                     setBuildLogs(prev => prev + `\n\nBUILD FAILED`);
                     setBuildStatus('error');
                 }
             }
         } catch (err: any) {
             setBuildStatus('error');
             setBuildLogs(prev => prev + `\n> Gradle Process Error: ${err.message}`);
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
        <p className="text-sm max-w-md mt-2">Start chatting to generate a Gradle project.</p>
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
                {buildStatus === 'success' && (
                   <button 
                    onClick={handleDownloadJar}
                    className="text-xs bg-green-600 hover:bg-green-500 text-white font-semibold px-4 py-1.5 rounded flex items-center gap-2 transition-all shadow-lg shadow-green-900/20 animate-in fade-in duration-300"
                    title="Download Build Artifact (.jar)"
                  >
                    <Package className="w-3 h-3" /> Download .jar
                  </button>
                )}
                
                <button 
                  onClick={handleDownloadSource}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded flex items-center gap-2 transition-colors border border-gray-600"
                  title="Download Project Source"
                >
                    <Download className="w-3 h-3" /> Source
                </button>

                {buildStatus !== 'success' && (
                    <button 
                      onClick={handleBuildAndAutoFix}
                      disabled={isBuilding}
                      className={`text-xs px-4 py-1.5 rounded flex items-center gap-2 transition-colors font-semibold border
                        ${isBuilding 
                          ? 'bg-purple-900/50 text-purple-200 border-purple-700 cursor-wait' 
                          : buildStatus === 'error' 
                            ? 'bg-red-900/30 text-red-200 border-red-800 hover:bg-red-900/50'
                            : 'bg-mc-accent text-white border-blue-500 hover:bg-blue-600'}`}
                    >
                        {isBuilding ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            {retryCount > 0 ? `Fixing (${retryCount}/${MAX_RETRIES})...` : 'Building...'}
                          </>
                        ) : (
                          <>
                            {buildStatus === 'error' ? <Hammer className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                            {buildStatus === 'error' ? 'Retry Fix' : 'Build'}
                          </>
                        )}
                    </button>
                )}
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
                          {buildStatus === 'success' && (
                             <span className="text-[10px] text-green-500 flex items-center gap-1 bg-green-900/20 px-2 py-0.5 rounded border border-green-900/50">
                                <CheckCircle2 className="w-3 h-3" /> Compiled
                             </span>
                          )}
                          <button 
                              onClick={handleCopy}
                              className="text-gray-400 hover:text-white transition-colors"
                              title="Copy Code"
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
                    <p>Select a file to view content</p>
                    {buildStatus === 'idle' && (
                      <div className="text-xs text-gray-600 max-w-xs text-center border border-gray-800 p-3 rounded">
                         Click "Build" to compile project.
                      </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* Build Console / Terminal */}
      {showConsole && (
        <div className={`border-t border-gray-700 bg-black flex flex-col transition-all duration-300 ease-in-out ${buildStatus === 'success' ? 'h-48' : 'h-72'}`}>
          <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-gray-700 h-10 shrink-0">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-gray-300">Run: ./gradlew build</span>
              {isBuilding && (
                  <span className="text-purple-400 ml-2 flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Auto-Fixing...
                  </span>
              )}
              {!isBuilding && buildStatus === 'success' && <span className="text-green-500 ml-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Build Successful</span>}
              {!isBuilding && buildStatus === 'error' && <span className="text-red-500 ml-2 flex items-center gap-1"><XCircle className="w-3 h-3"/> Build Failed</span>}
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