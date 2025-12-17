
import React, { useState, useEffect } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Copy, Check, FolderOpen, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  onProjectUpdate?: (newProject: GeneratedProject) => void;
  onTriggerAutoFix?: (logs: string) => void;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings }) => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const selectedFile = project?.files.find(f => f.path === selectedFilePath) || null;

  useEffect(() => {
    if (project && project.files.length > 0) {
      if (!selectedFilePath || !project.files.some(f => f.path === selectedFilePath)) {
          const mainFile = project.files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || project.files[0];
          setSelectedFilePath(mainFile.path);
      }
    }
  }, [project]);

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
    project.files.forEach(file => zip.file(file.path, file.content));
    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settings.name}-src.zip`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!project) return <div className="flex-1 flex flex-col items-center justify-center text-gray-500 h-full p-8 text-center border-l border-gray-800"><FileCode className="w-16 h-16 mb-4 opacity-20" /><p className="text-lg font-medium">Crie um plugin para ver o código</p></div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e1e] border-l border-gray-800 overflow-hidden relative">
        <div className="h-12 border-b border-gray-700 flex items-center justify-between px-4 bg-[#252526] shrink-0 z-10 shadow-md">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-mc-accent" />
                {settings.name}
            </h3>
            
            <div className="flex items-center gap-2">
                <button onClick={handleDownloadSource} className="text-xs bg-mc-accent hover:bg-blue-600 text-white font-semibold px-3 py-1.5 rounded flex items-center gap-2 transition-colors active:scale-95 shadow-md">
                    <Download className="w-3 h-3" /> Download Fonte (.zip)
                </button>
            </div>
        </div>

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-56 bg-[#252526]/50 border-r border-gray-700 overflow-y-auto shrink-0 custom-scrollbar shadow-xl">
          <div className="py-2">
            {project?.files.map((file, index) => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFilePath === file.path;
               return (
                <motion.button 
                  key={file.path} 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.01 }}
                  onClick={() => setSelectedFilePath(file.path)} 
                  className={`w-full text-left px-4 py-1.5 text-xs flex items-center gap-2 truncate transition-all ${isSelected ? 'bg-[#37373d] text-white border-l-2 border-mc-accent' : 'text-gray-400 border-l-2 border-transparent hover:bg-white/5 hover:text-gray-300'}`}
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
                          <span className="text-[10px] text-gray-500 font-mono tracking-tight">{selectedFile.path}</span>
                          <button onClick={handleCopy} className="text-gray-500 hover:text-white transition-colors p-1">
                            {copied ? <Check className="w-3.5 h-3.5 text-mc-green" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                      </div>
                      <div className="flex-1 overflow-auto p-4 custom-scrollbar font-mono text-[13px] leading-relaxed text-gray-300">
                          <pre className="whitespace-pre select-text"><code className="block">{selectedFile.content}</code></pre>
                      </div>
                  </motion.div>
              ) : (
                  <div className="flex items-center justify-center h-full text-gray-600 text-xs italic">Selecione um arquivo</div>
              )}
            </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default CodeViewer;
