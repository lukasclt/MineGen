import React, { useState, useEffect } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, ChevronRight, ChevronDown, Download, Hammer, Loader2 } from 'lucide-react';
import JSZip from 'jszip';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings }) => {
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);

  useEffect(() => {
    if (project && project.files.length > 0) {
      // Try to find Main.java or the first java file, otherwise just the first file
      const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
      setSelectedFile(mainFile);
    } else {
        setSelectedFile(null);
    }
  }, [project]);

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

  const handleCompile = async () => {
    if (!project) return;
    setIsCompiling(true);

    // Simulate compilation delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const zip = new JSZip();
    project.files.forEach(file => {
      zip.file(file.path, file.content);
    });

    // Add a readme explaining this is a source jar
    zip.file("README.txt", "This is a Source Code JAR.\n\nSince this is a web-based generator, we cannot run a full Java compiler in the browser.\n\nPlease extract this JAR or rename it to .zip, and run 'mvn clean package' to build the final binary.");

    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Naming it -sources.jar is the standard convention for source archives in Java
    a.download = `${settings.name}-${settings.version}-sources.jar`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setIsCompiling(false);
  };

  if (!project) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-900 text-gray-500 h-full p-8 text-center border-l border-gray-800">
        <FileCode className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-medium">No Code Generated Yet</p>
        <p className="text-sm max-w-md mt-2">Start chatting to generate a Minecraft plugin. Your generated files will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] border-l border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526]">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                Project Explorer
            </h3>
            <div className="flex items-center gap-2">
                <button 
                  onClick={handleDownload}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded flex items-center gap-2 transition-colors border border-gray-600"
                >
                    <Download className="w-3 h-3" /> Source ZIP
                </button>
                <button 
                  onClick={handleCompile}
                  disabled={isCompiling}
                  className="text-xs bg-mc-green hover:bg-green-500 text-black font-semibold px-3 py-1.5 rounded flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isCompiling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hammer className="w-3 h-3" />}
                    {isCompiling ? 'Compiling...' : 'Compile .jar'}
                </button>
            </div>
        </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-60 bg-[#252526] border-r border-gray-700 overflow-y-auto flex-shrink-0">
          <div className="py-2">
            {project.files.map((file, index) => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFile?.path === file.path;
               return (
                <button
                    key={index}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 truncate hover:bg-[#2a2d2e] transition-colors ${isSelected ? 'bg-[#37373d] text-white border-l-2 border-mc-accent' : 'text-gray-400 border-l-2 border-transparent'}`}
                >
                    <FileCode className={`w-4 h-4 ${fileName?.endsWith('.java') ? 'text-orange-400' : fileName?.endsWith('.yml') ? 'text-purple-400' : fileName?.endsWith('.xml') ? 'text-blue-400' : 'text-gray-400'}`} />
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
                    <div className="h-9 flex items-center justify-between px-4 bg-[#1e1e1e] border-b border-gray-800">
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
                        <pre className="font-mono text-sm text-gray-300">
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
    </div>
  );
};

export default CodeViewer;