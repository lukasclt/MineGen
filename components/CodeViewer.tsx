
import React, { useState, useEffect, useRef } from 'react';
import { GeneratedProject, GeneratedFile, PluginSettings } from '../types';
import { FileCode, Save, Check, FolderOpen, RefreshCw, HardDrive, File, MoreVertical, X, MessageSquarePlus, TerminalSquare, ArrowRight } from 'lucide-react';
import { saveFileToDisk } from '../services/fileSystem';

interface CodeViewerProps {
  project: GeneratedProject | null;
  settings: PluginSettings;
  directoryHandle: any;
  onAddToContext: (text: string) => void;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ project, settings, directoryHandle, onAddToContext }) => {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, text: string} | null>(null);
  
  // Prompt Modal State
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [promptCode, setPromptCode] = useState<string>('');
  const [promptInstruction, setPromptInstruction] = useState('');
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const files = project?.files || [];
  const selectedFile = files.find(f => f.path === selectedFilePath) || null;
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Sync content when file selection changes
  useEffect(() => {
    if (project && files.length > 0) {
      if (!selectedFilePath || !files.some(f => f.path === selectedFilePath)) {
          const mainFile = files.find(f => f.path.endsWith('Main.java') || f.path.endsWith('.java')) || files[0];
          setSelectedFilePath(mainFile?.path || null);
      }
    }
  }, [project, files.length]);

  useEffect(() => {
    if (selectedFile) {
        setFileContent(selectedFile.content);
        setIsDirty(false);
    } else {
        setFileContent('');
    }
  }, [selectedFile, selectedFilePath]);

  // Focus prompt input when modal opens
  useEffect(() => {
    if (isPromptOpen && promptInputRef.current) {
        setTimeout(() => promptInputRef.current?.focus(), 100);
    }
  }, [isPromptOpen]);

  const handleSave = async () => {
    if (!selectedFile || !directoryHandle) return;
    setIsSaving(true);
    try {
        await saveFileToDisk(directoryHandle, selectedFile.path, fileContent);
        selectedFile.content = fileContent; 
        setIsDirty(false);
    } catch (e) {
        console.error("Save failed", e);
        alert("Erro ao salvar: " + e);
    } finally {
        setIsSaving(false);
    }
  };

  const initiateSendToChat = (text: string) => {
      setPromptCode(text);
      setPromptInstruction('');
      setIsPromptOpen(true);
  };

  const handleSendSelectionToChat = () => {
    if (!textAreaRef.current) return;
    const start = textAreaRef.current.selectionStart;
    const end = textAreaRef.current.selectionEnd;

    let textToSend = "";

    if (start !== end) {
        textToSend = textAreaRef.current.value.substring(start, end);
    } else {
        const confirmSend = window.confirm("Nenhum código selecionado. Enviar o arquivo inteiro para o Agente?");
        if (confirmSend) {
            textToSend = fileContent;
        } else {
            return;
        }
    }

    if (textToSend) {
        initiateSendToChat(textToSend);
    }
  };

  const confirmPrompt = () => {
      if (!promptCode) return;
      
      const instruction = promptInstruction.trim() || "Analise este código.";
      const fullMessage = `${instruction}\n\n\`\`\`java\n${promptCode}\n\`\`\``;
      
      onAddToContext(fullMessage);
      setIsPromptOpen(false);
  };

  const handlePromptKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          confirmPrompt();
      }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            handleSave();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fileContent, selectedFile]);

  // Context Menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection()?.toString();
    if (selection) {
        setContextMenu({ x: e.clientX, y: e.clientY, text: selection });
    }
  };

  const closeContextMenu = () => setContextMenu(null);

  if (!project) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-[#555]">
            <div className="w-24 h-24 mb-4 opacity-10 bg-no-repeat bg-center" style={{ backgroundImage: 'url(https://raw.githubusercontent.com/microsoft/vscode/main/resources/linux/code.png)', backgroundSize: 'contain' }}></div>
            <p className="text-sm font-sans">Abra uma pasta para começar a editar</p>
        </div>
    );
  }

  return (
    <div className="flex w-full h-full bg-[#1e1e1e] overflow-hidden select-none relative" onClick={closeContextMenu}>
      {/* Sidebar - Explorer */}
      <div className="w-64 bg-[#252526] flex flex-col border-r border-[#2b2b2b] shrink-0">
        <div className="h-9 px-4 flex items-center text-[11px] font-bold text-[#bbbbbb] uppercase tracking-wide shrink-0">
            Explorer
        </div>
        <div className="px-2 py-1 flex items-center gap-1 text-[#cccccc] font-bold text-xs bg-[#37373d] mx-2 rounded-sm mb-2 shrink-0">
             <span className={`transform transition-transform`}>▼</span>
             <span className="truncate">{settings.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
            {files.map(file => {
               const fileName = file.path.split('/').pop();
               const isSelected = selectedFilePath === file.path;
               return (
                <div 
                    key={file.path} 
                    onClick={() => setSelectedFilePath(file.path)}
                    className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-[13px] rounded-sm mb-[1px] ${isSelected ? 'bg-[#37373d] text-white' : 'text-[#cccccc] hover:bg-[#2a2d2e]'}`}
                >
                    <FileCode className={`w-3.5 h-3.5 ${file.path.endsWith('.java') ? 'text-[#b07219]' : file.path.endsWith('.xml') ? 'text-[#e37933]' : 'text-[#519aba]'}`} />
                    <span className="truncate flex-1">{fileName}</span>
                </div>
               );
            })}
        </div>
      </div>
      
      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-[#1e1e1e] min-w-0">
        {/* Tab Bar */}
        {selectedFile ? (
            <div className="h-9 bg-[#1e1e1e] flex items-center border-b border-[#2b2b2b] shrink-0 overflow-x-auto no-scrollbar">
                <div className="bg-[#1e1e1e] text-[#ffffff] px-3 h-full flex items-center gap-2 text-[13px] border-t-2 border-[#007acc] min-w-fit">
                    <FileCode className="w-3.5 h-3.5 text-[#e37933]" />
                    <span className="font-normal">{selectedFile.path.split('/').pop()}</span>
                    {isDirty && <div className="w-2 h-2 rounded-full bg-white ml-1"></div>}
                    <button className="hover:bg-[#333] rounded p-0.5 ml-1"><X className="w-3 h-3 text-gray-400" /></button>
                </div>
                {/* Actions */}
                <div className="ml-auto px-4 flex items-center gap-2">
                     <button
                        onClick={handleSendSelectionToChat}
                        className="text-gray-300 hover:text-white hover:bg-[#333] px-2 py-1 rounded flex items-center gap-1.5 text-xs transition-colors border border-transparent hover:border-[#444]"
                        title="Enviar código selecionado para o Agente"
                     >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        <span>Enviar p/ Agente</span>
                     </button>
                     <div className="w-[1px] h-4 bg-[#333] mx-1"></div>
                    <button 
                        onClick={handleSave} 
                        disabled={!isDirty && !isSaving}
                        className={`text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-xs ${isSaving ? 'animate-pulse' : ''}`}
                        title="Save (Ctrl+S)"
                    >
                        {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>
        ) : (
            <div className="h-9 bg-[#252526] border-b border-[#1e1e1e]"></div>
        )}

        {/* Editor Content */}
        <div className="flex-1 relative overflow-hidden group">
            {selectedFile ? (
                <textarea
                    ref={textAreaRef}
                    value={fileContent}
                    onChange={(e) => {
                        setFileContent(e.target.value);
                        setIsDirty(true);
                    }}
                    onContextMenu={handleContextMenu}
                    spellCheck={false}
                    className="w-full h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[14px] leading-6 p-4 resize-none focus:outline-none custom-scrollbar selection:bg-[#264f78]"
                    style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}
                />
            ) : (
                <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center">
                    <div className="text-center opacity-30">
                        <p className="text-3xl font-bold tracking-tight text-[#333] mb-2">VS Code AI</p>
                        <p className="text-sm text-[#555]">Select a file to edit</p>
                    </div>
                </div>
            )}

            {/* Custom Context Menu */}
            {contextMenu && (
                <div 
                    className="absolute z-50 bg-[#252526] border border-[#454545] shadow-xl rounded-md py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: Math.min(contextMenu.y - 50, window.innerHeight - 200), left: Math.min(contextMenu.x - 300, window.innerWidth - 200) }}
                >
                     <button 
                        onClick={() => {
                            initiateSendToChat(contextMenu.text);
                            closeContextMenu();
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-[#cccccc] hover:bg-[#094771] hover:text-white flex items-center gap-2"
                    >
                        <MessageSquarePlus className="w-3 h-3" /> Adicionar ao Chat...
                    </button>
                    <div className="h-[1px] bg-[#454545] my-1 mx-2"></div>
                    <button className="w-full text-left px-3 py-1.5 text-xs text-[#cccccc] hover:bg-[#094771] hover:text-white opacity-50 cursor-not-allowed">
                        Copiar
                    </button>
                </div>
            )}
        </div>
      </div>

      {/* PROMPT MODAL */}
      {isPromptOpen && (
          <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-20">
              <div className="bg-[#252526] border border-[#454545] shadow-2xl rounded-lg w-[500px] max-w-[90%] flex flex-col overflow-hidden animate-in slide-in-from-top-4 duration-200">
                   <div className="bg-[#333] px-3 py-2 flex items-center justify-between border-b border-[#454545]">
                       <span className="text-xs font-bold text-white flex items-center gap-2">
                           <MessageSquarePlus className="w-4 h-4 text-mc-accent" />
                           INSTRUÇÃO PARA O AGENTE
                       </span>
                       <button onClick={() => setIsPromptOpen(false)} className="text-gray-400 hover:text-white">
                           <X className="w-4 h-4" />
                       </button>
                   </div>
                   
                   <div className="p-4 flex flex-col gap-3">
                       <div>
                           <label className="text-xs text-gray-400 font-semibold mb-1 block">O que você quer fazer com este código?</label>
                           <textarea
                               ref={promptInputRef}
                               value={promptInstruction}
                               onChange={(e) => setPromptInstruction(e.target.value)}
                               onKeyDown={handlePromptKeyDown}
                               placeholder="Ex: Refatore este método, Encontre o erro, Adicione comentários..."
                               className="w-full bg-[#1e1e1e] border border-[#454545] rounded p-2 text-sm text-white focus:outline-none focus:border-mc-accent resize-none h-20"
                           />
                       </div>

                       <div className="bg-[#1e1e1e] rounded border border-[#333] p-2 max-h-[150px] overflow-y-auto">
                           <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider">Preview do Contexto</div>
                           <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-all">
                               {promptCode.substring(0, 300)}
                               {promptCode.length > 300 && '...'}
                           </pre>
                       </div>

                       <div className="flex justify-end gap-2 mt-2">
                           <button 
                               onClick={() => setIsPromptOpen(false)}
                               className="px-3 py-1.5 rounded text-xs font-medium text-gray-300 hover:text-white hover:bg-[#333]"
                           >
                               Cancelar
                           </button>
                           <button 
                               onClick={confirmPrompt}
                               className="px-3 py-1.5 rounded text-xs font-bold text-white bg-[#007acc] hover:bg-[#0062a3] flex items-center gap-1.5"
                           >
                               Enviar <ArrowRight className="w-3 h-3" />
                           </button>
                       </div>
                   </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default CodeViewer;
