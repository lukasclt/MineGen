
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject } from '../types';
import { Send, Bot, User, Cpu, AlertCircle, Trash2, BrainCircuit, Terminal as TerminalIcon, Loader2, CheckCircle2, FolderInput, Layers, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  // File System
  directoryHandle: any;
  onSetDirectoryHandle: (handle: any) => void;
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
  onClearProject,
  onUpdateProjectName,
  directoryHandle,
  onSetDirectoryHandle
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [reasoningStep, setReasoningStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Initial Sync when handle is available but no project loaded (e.g., page reload)
  useEffect(() => {
    const autoSync = async () => {
      if (directoryHandle && !currentProject && !isReading) {
         await syncProjectFiles(directoryHandle, false);
      }
    };
    autoSync();
  }, [directoryHandle]);

  // Queue Processor
  useEffect(() => {
    const processNextInQueue = async () => {
      if (isLoading || queue.length === 0) return;

      const nextPrompt = queue[0];
      setQueue(prev => prev.slice(1));
      
      await executeAiGeneration(nextPrompt);
    };

    processNextInQueue();
  }, [queue, isLoading, currentProject]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const syncProjectFiles = async (handle: any, notifyUser: boolean = true) => {
    setIsReading(true);
    try {
      const hasPerm = await verifyPermission(handle, true);
      if (!hasPerm) throw new Error("Permissão necessária");

      const loadedProject = await readProjectFromDisk(handle);
      onProjectGenerated(loadedProject);
      
      if (notifyUser && loadedProject.files.length > 0) {
        setMessages(prev => [...prev, {
          role: 'model',
          text: `📁 **Sincronização Concluída**\nLi ${loadedProject.files.length} arquivos da pasta **${handle.name}**.\nEstou pronto para editar o projeto.`
        }]);
      } else if (notifyUser) {
        setMessages(prev => [...prev, {
          role: 'model',
          text: `📁 Pasta **${handle.name}** vinculada. A pasta parece vazia. Posso criar um projeto do zero para você.`
        }]);
      }
    } catch (error: any) {
      console.error("Sync error", error);
      if (notifyUser) {
        setMessages(prev => [...prev, {
           role: 'model',
           text: `Erro ao ler arquivos: ${error.message}. Tente reconectar a pasta.`,
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
      await syncProjectFiles(handle, true);
      return handle;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
         alert("Erro ao selecionar pasta: " + error.message);
      }
      return null;
    }
  };

  const executeAiGeneration = async (text: string) => {
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
      // AI Generation
      const project = await generatePluginCode(text, settings, currentProject);
      
      clearInterval(progressInterval);
      setProgress(98);
      setLoadingText('Escrevendo alterações...');
      setIsSaving(true);

      // Save to Disk
      await saveProjectToDisk(directoryHandle, project);
      
      setIsSaving(false);
      setProgress(100);

      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Update local state with new files (merge logic is handled by replacement for now)
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
      const errorMessage: ChatMessage = {
        role: 'model',
        text: error.message || "Houve uma falha crítica no processo de geração.",
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const handleAddToQueue = async (text: string) => {
    if (!text.trim()) return;

    let currentHandle = directoryHandle;

    if (!currentHandle) {
       const confirmSelect = window.confirm("Selecione a pasta do projeto (vazia ou existente) para permitir que o Agente IA gerencie os arquivos.");
       if (!confirmSelect) return;
       
       currentHandle = await handleSelectFolder();
       if (!currentHandle) return;
    }

    // Verify permission before adding to queue
    try {
      const hasPermission = await verifyPermission(currentHandle, true);
      if (!hasPermission) {
         // Browser might prompt here
      }
    } catch (e) {
      return; 
    }

    const userMessage: ChatMessage = { role: 'user', text: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setQueue(prev => [...prev, text]);
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

  const handleClear = () => {
    if (confirm("Limpar histórico de chat? (Arquivos não serão apagados)")) {
        const defaultMsg: ChatMessage = { 
            role: 'model', 
            text: directoryHandle 
              ? `Histórico limpo. Estou pronto para editar os arquivos em **${directoryHandle.name}**.` 
              : `Histórico limpo. Selecione uma pasta para começar.` 
        };
        setMessages([defaultMsg]);
        setQueue([]);
    }
  };

  return (
    <div className="flex flex-col h-full relative z-10">
       <div className="absolute top-2 right-4 z-10 flex gap-2">
         {directoryHandle && (
            <button 
              onClick={() => syncProjectFiles(directoryHandle)} 
              title="Ler arquivos do disco novamente"
              className={`p-2 rounded-full transition-colors bg-mc-panel/80 backdrop-blur-sm border border-gray-700 shadow-lg ${isReading ? 'text-mc-accent animate-spin' : 'text-gray-400 hover:text-white'}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
         )}
        <button onClick={handleClear} className="text-gray-400 hover:text-red-400 p-2 rounded-full transition-colors bg-mc-panel/80 backdrop-blur-sm border border-gray-700 shadow-lg"><Trash2 className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'model' && (
                <div className="w-8 h-8 rounded-full bg-mc-panel flex items-center justify-center flex-shrink-0 border border-gray-700 mt-1 shadow-lg ring-1 ring-white/5">
                  {msg.isError ? <AlertCircle className="w-5 h-5 text-red-500" /> : <Bot className="w-5 h-5 text-mc-accent" />}
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-lg backdrop-blur-sm ${msg.role === 'user' ? 'bg-mc-accent text-white rounded-br-none' : msg.isError ? 'bg-red-900/40 border border-red-500/50 text-red-100 rounded-bl-none' : 'bg-mc-panel/90 border border-gray-700 text-gray-200 rounded-bl-none'}`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                {msg.projectData && (
                  <div className="mt-3 pt-3 border-t border-gray-600/50 flex items-center justify-between text-[11px]">
                    <div className="text-mc-green font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 
                      {msg.text.includes("Sincronização") ? "Lido do Disco" : "Atualizado no Disco"}
                    </div>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg ring-1 ring-white/5"><User className="w-5 h-5 text-gray-300" /></div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-2 max-w-[85%]"
          >
            <div className="flex gap-4 items-start">
               <div className="w-8 h-8 rounded-full bg-mc-panel flex items-center justify-center border border-gray-700 shadow-lg mt-1"><Cpu className="w-5 h-5 text-mc-accent animate-pulse" /></div>
               <div className="bg-mc-panel/90 border border-gray-700 rounded-2xl rounded-bl-none px-4 py-3 flex flex-col gap-3 min-w-[280px] shadow-[0_0_30px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
                  <div className="flex justify-between items-center text-xs text-gray-400 font-mono">
                    <span className="flex items-center gap-2">
                        {isSaving ? <FolderInput className="w-3 h-3 animate-bounce text-mc-gold" /> : <Loader2 className="w-3 h-3 animate-spin text-mc-accent" />} 
                        {loadingText}
                    </span>
                    <span className="text-mc-accent font-bold tracking-tighter">{Math.round(progress)}%</span>
                  </div>
                  
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full relative overflow-hidden bg-mc-accent shadow-mc-accent/50"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] animate-[shimmer_1.5s_infinite]" />
                    </motion.div>
                  </div>

                  <div className="bg-black/30 rounded-lg p-3 border border-gray-700/50 flex flex-col gap-2 shadow-inner">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-mc-gold uppercase tracking-[0.2em] opacity-80">
                      <BrainCircuit className="w-3 h-3" /> Agente Ativo
                    </div>
                    <div className="flex items-start gap-2 min-h-[30px]">
                      <TerminalIcon className="w-3 h-3 text-gray-500 mt-0.5 shrink-0" />
                      <AnimatePresence mode="wait">
                        <motion.span 
                          key={reasoningStep}
                          initial={{ opacity: 0, x: 5 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -5 }}
                          className="text-[11px] text-gray-300 font-mono leading-tight italic"
                        >
                          {REASONING_STEPS[reasoningStep]}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  </div>
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-mc-dark via-mc-dark to-transparent z-10">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto group">
          <textarea
            ref={textareaRef} 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={directoryHandle ? (queue.length > 0 ? "Adicionar à fila..." : "Instrua o Agente a alterar, corrigir ou criar...") : "Clique aqui para selecionar a pasta do projeto..."} 
            className={`w-full bg-[#2B2D31]/95 backdrop-blur-md text-white border ${!directoryHandle ? 'border-mc-gold/50 shadow-[0_0_15px_rgba(255,170,0,0.1)]' : 'border-gray-600'} rounded-xl pl-4 pr-12 py-4 shadow-2xl focus:outline-none focus:border-mc-accent transition-all text-sm group-hover:border-gray-500 resize-none custom-scrollbar`}
            style={{ minHeight: '54px', maxHeight: '200px' }} 
          />
          <button type="submit" disabled={!input.trim() && !!directoryHandle} className="absolute right-2 bottom-3 bg-mc-accent hover:bg-blue-600 text-white rounded-lg px-3 py-1.5 transition-all disabled:opacity-50 flex items-center justify-center active:scale-95 h-9">
             {!directoryHandle ? <FolderInput className="w-5 h-5" /> : (isLoading ? <Layers className="w-5 h-5" /> : <Send className="w-5 h-5" />)}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default ChatInterface;
