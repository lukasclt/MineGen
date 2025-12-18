
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment } from '../types';
import { Send, Bot, User, Cpu, AlertCircle, Trash2, Loader2, CheckCircle2, FileText, Image as ImageIcon, Paperclip, X, RefreshCw, Lock } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';
import { getDirectoryHandle, saveProjectToDisk, verifyPermission, readProjectFromDisk } from '../services/fileSystem';

interface ChatInterfaceProps {
  settings: PluginSettings;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  currentProject: GeneratedProject | null;
  onProjectGenerated: (project: any) => void;
  onClearProject: () => void;
  onUpdateProjectName: (name: string) => void;
  directoryHandle: any;
  onSetDirectoryHandle: (handle: any) => void;
  pendingMessage?: string | null;
  onClearPendingMessage?: () => void;
}

const REASONING_STEPS = [
  "Lendo estrutura de arquivos atual...",
  "Analisando contexto do projeto...",
  "Planejando modificações no código...",
  "Aplicando padrões de design...",
  "Atualizando referências e imports...",
  "Verificando consistência do Maven...",
  "Finalizando escrita dos arquivos..."
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, 
  messages, 
  setMessages, 
  currentProject, 
  onProjectGenerated, 
  directoryHandle,
  onSetDirectoryHandle,
  pendingMessage,
  onClearPendingMessage
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [reasoningStep, setReasoningStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<{text: string, att: Attachment[]}[]>([]);
  const [needsPermission, setNeedsPermission] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, progress, reasoningStep]);

  useEffect(() => {
    let interval: number;
    if (isLoading) {
      interval = window.setInterval(() => {
        setReasoningStep(prev => (prev + 1) % REASONING_STEPS.length);
      }, 2500);
    } else {
      setReasoningStep(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Initial Sync Logic with Permission Check
  useEffect(() => {
    const checkAndSync = async () => {
      if (directoryHandle && !currentProject && !isReading) {
          // Check permission state first without requesting (requesting requires user gesture)
          try {
             const opts = { mode: 'readwrite' };
             // @ts-ignore - queryPermission is valid on FileSystemHandle
             const status = await directoryHandle.queryPermission(opts);
             
             if (status === 'granted') {
                 setNeedsPermission(false);
                 await syncProjectFiles(directoryHandle, false);
             } else {
                 setNeedsPermission(true);
             }
          } catch (e) {
             console.warn("Could not query permissions", e);
             setNeedsPermission(true);
          }
      }
    };
    checkAndSync();
  }, [directoryHandle, currentProject]);

  // Watch for external pending messages (From CodeViewer)
  useEffect(() => {
    if (pendingMessage) {
        handleAddToQueue(pendingMessage);
        if (onClearPendingMessage) onClearPendingMessage();
    }
  }, [pendingMessage]);

  // Queue Processor
  useEffect(() => {
    const processNextInQueue = async () => {
      if (isLoading || queue.length === 0) return;

      const { text, att } = queue[0];
      setQueue(prev => prev.slice(1));
      
      await executeAiGeneration(text, att);
    };

    processNextInQueue();
  }, [queue, isLoading, currentProject]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleAuthorize = async () => {
      if (!directoryHandle) return;
      // This is called via click, so verifyPermission (which calls requestPermission) is allowed
      const hasPerm = await verifyPermission(directoryHandle, true);
      if (hasPerm) {
          setNeedsPermission(false);
          await syncProjectFiles(directoryHandle, true);
      }
  };

  const syncProjectFiles = async (handle: any, notifyUser: boolean = true) => {
    setIsReading(true);
    try {
      // NOTE: requestPermission must be called in a gesture. 
      // syncProjectFiles is now safe to call if we know permission is granted OR if called from a button click.
      const loadedProject = await readProjectFromDisk(handle);
      onProjectGenerated(loadedProject);
      
      if (notifyUser) {
        setMessages(prev => [...prev, {
          role: 'model',
          text: `📁 **Sincronização Concluída**\nLi ${loadedProject.files.length} arquivos da pasta **${handle.name}**.`
        }]);
      }
    } catch (error: any) {
      console.error("Sync error", error);
      if (notifyUser) {
        setMessages(prev => [...prev, {
           role: 'model',
           text: `Erro ao ler arquivos: ${error.message}. (Talvez falte permissão?)`,
           isError: true
        }]);
      }
    } finally {
      setIsReading(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const handle = await getDirectoryHandle();
      onSetDirectoryHandle(handle);
      setNeedsPermission(false);
      // New handle implies granted permission usually
      await syncProjectFiles(handle, true);
      return handle;
    } catch (error: any) {
      if (error.name !== 'AbortError') alert("Erro ao selecionar pasta: " + error.message);
      return null;
    }
  };

  const executeAiGeneration = async (text: string, currentAttachments: Attachment[]) => {
    setIsLoading(true);
    setProgress(0);
    setLoadingText('Processando agente...');

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 95) return 95;
        return prev + Math.max(0.3, (95 - prev) / 20);
      });
    }, 400);

    try {
      const project = await generatePluginCode(text, settings, currentProject, currentAttachments);
      
      clearInterval(progressInterval);
      setProgress(98);
      setLoadingText('Escrevendo alterações...');
      setIsSaving(true);

      // Verify permission one last time before saving (although queue should imply it, better safe)
      // Note: We cannot request permission here (async), so we assume it was handled via the authorize button
      await saveProjectToDisk(directoryHandle, project);
      
      setIsSaving(false);
      setProgress(100);

      await new Promise(resolve => setTimeout(resolve, 800));
      
      onProjectGenerated(project);

      const aiMessage: ChatMessage = {
        role: 'model',
        text: project.explanation,
        projectData: project
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
    } catch (error: any) {
      clearInterval(progressInterval);
      setIsSaving(false);
      let errMsg = error.message || "Falha crítica.";
      if (errMsg.includes("not allowed by the user agent")) {
          errMsg = "Erro de Permissão: O navegador bloqueou o acesso aos arquivos. Por favor, clique no botão 'Autorizar Acesso' acima ou re-selecione a pasta.";
          setNeedsPermission(true);
      }

      setMessages(prev => [...prev, {
        role: 'model',
        text: errMsg,
        isError: true
      }]);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
        reader.onload = () => {
          setAttachments(prev => [...prev, {
            type: 'image',
            name: file.name,
            content: reader.result as string
          }]);
        };
      } else {
        // Assume text for everything else for context
        reader.readAsText(file);
        reader.onload = () => {
          setAttachments(prev => [...prev, {
            type: 'text',
            name: file.name,
            content: reader.result as string
          }]);
        };
      }
    });
    
    // Clear input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddToQueue = async (text: string) => {
    if (!text.trim() && attachments.length === 0) return;

    let currentHandle = directoryHandle;

    if (!currentHandle) {
       // Se veio via prompt do CodeViewer, talvez já tenha handle, mas se não tiver:
       const confirmSelect = window.confirm("Selecione a pasta do projeto para permitir que o Agente IA gerencie os arquivos.");
       if (!confirmSelect) return;
       currentHandle = await handleSelectFolder();
       if (!currentHandle) return;
    }

    if (needsPermission) {
        alert("Por favor, autorize o acesso à pasta clicando no botão 'Autorizar Acesso' antes de enviar comandos.");
        return;
    }

    const userMessage: ChatMessage = { 
        role: 'user', 
        text: text,
        attachments: [...attachments] // copy
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQueue(prev => [...prev, { text, att: [...attachments] }]);
    
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddToQueue(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddToQueue(input);
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10 bg-[#1e1e1e]">
       {/* Toolbar Header */}
       <div className="absolute top-2 right-4 z-10 flex gap-2">
         {directoryHandle && (
            <button 
              onClick={() => handleAuthorize()} // Use handleAuthorize to cover re-sync
              title="Sincronizar arquivos do disco"
              className={`p-2 rounded-md hover:bg-[#333] transition-colors ${isReading ? 'text-blue-400 animate-spin' : 'text-gray-400'}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
         )}
        <button onClick={() => setMessages([])} className="text-gray-400 hover:text-red-400 p-2 rounded-md hover:bg-[#333] transition-colors"><Trash2 className="w-4 h-4" /></button>
      </div>
      
      {/* Permission Banner */}
      {needsPermission && directoryHandle && (
          <div className="bg-blue-900/40 border-b border-blue-500/30 p-3 flex items-center justify-between animate-fade-in shrink-0">
              <div className="flex items-center gap-2 text-sm text-blue-200">
                  <Lock className="w-4 h-4 text-blue-400" />
                  <span>Acesso à pasta <strong>{directoryHandle.name}</strong> requer confirmação.</span>
              </div>
              <button 
                  onClick={handleAuthorize}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 px-3 rounded shadow-sm transition-colors"
              >
                  Autorizar Acesso
              </button>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 custom-scrollbar">
        {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === 'model' ? 'bg-[#007acc]' : 'bg-[#333]'}`}>
                    {msg.isError ? <AlertCircle className="w-5 h-5 text-red-200" /> : msg.role === 'model' ? <Bot className="w-5 h-5 text-white" /> : <User className="w-5 h-5 text-gray-300" />}
                </div>
                
                <div className={`max-w-[85%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-2.5 rounded text-sm whitespace-pre-wrap leading-6 shadow-sm ${msg.role === 'user' ? 'bg-[#264f78] text-white' : 'bg-[#252526] text-[#cccccc] border border-[#333]'}`}>
                        {msg.text}
                        {msg.projectData && (
                            <div className="mt-2 pt-2 border-t border-[#444] text-xs text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Alterações aplicadas
                            </div>
                        )}
                    </div>
                    
                    {/* Attachments Display in Message */}
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {msg.attachments.map((att, i) => (
                                <div key={i} className="bg-[#252526] border border-[#333] rounded p-1.5 flex items-center gap-2 text-xs text-gray-400">
                                    {att.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                                    <span className="max-w-[100px] truncate">{att.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        ))}

        {isLoading && (
            <div className="flex gap-3 animate-pulse">
                <div className="w-8 h-8 rounded bg-[#007acc] flex items-center justify-center mt-1"><Cpu className="w-5 h-5 text-white" /></div>
                <div className="bg-[#252526] border border-[#333] rounded px-4 py-3 text-sm text-[#999] font-mono flex flex-col gap-2 min-w-[250px]">
                     <div className="flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#007acc]" />
                        <span>{loadingText} ({Math.round(progress)}%)</span>
                     </div>
                     <div className="text-xs text-[#666] italic pl-5">
                         {REASONING_STEPS[reasoningStep]}
                     </div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-[#1e1e1e] border-t border-[#333] z-20">
        
        {/* Attachment Previews */}
        {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1 custom-scrollbar">
                {attachments.map((att, i) => (
                    <div key={i} className="relative bg-[#2d2d2d] rounded p-2 flex items-center gap-2 shrink-0 border border-[#444]">
                        {att.type === 'image' ? (
                            <div className="w-8 h-8 bg-black rounded overflow-hidden">
                                <img src={att.content} className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <FileText className="w-8 h-8 text-gray-400 p-1" />
                        )}
                        <div className="flex flex-col">
                             <span className="text-[10px] text-gray-300 max-w-[80px] truncate">{att.name}</span>
                             <span className="text-[9px] text-gray-500 uppercase">{att.type}</span>
                        </div>
                        <button onClick={() => removeAttachment(i)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm hover:bg-red-600"><X className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
           <input 
             type="file" 
             multiple 
             ref={fileInputRef} 
             className="hidden" 
             onChange={handleFileUpload} 
           />
           <button 
             type="button" 
             onClick={() => fileInputRef.current?.click()}
             className="text-gray-400 hover:text-white p-2 rounded hover:bg-[#333] transition-colors"
             title="Anexar arquivo ou imagem"
           >
             <Paperclip className="w-5 h-5" />
           </button>

          <textarea
            ref={textareaRef} 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Instrua o Agente (Cole links, código ou anexe arquivos)..."
            className="flex-1 bg-[#252526] text-[#cccccc] rounded border border-[#333] px-3 py-2 text-sm focus:outline-none focus:border-[#007acc] resize-none custom-scrollbar"
            style={{ minHeight: '38px', maxHeight: '150px' }} 
          />
          <button type="submit" disabled={!input.trim() && attachments.length === 0} className="bg-[#007acc] hover:bg-[#0062a3] text-white rounded px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
             <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
