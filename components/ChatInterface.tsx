
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User, SavedProject } from '../types';
import { Send, Bot, User as UserIcon, AlertCircle, Trash2, Loader2, CheckCircle2, FileText, Paperclip, X, Clock, Shield, Timer, HardDrive, StopCircle, ListPlus, Eye } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';
import { saveProjectToDisk, saveProjectStateToDisk } from '../services/fileSystem';
import { playSound } from '../services/audioService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  currentProject: GeneratedProject | null;
  fullProject: SavedProject | null; 
  onProjectGenerated: (project: any) => void;
  directoryHandle: any;
  onSetDirectoryHandle: (handle: any) => void;
  pendingMessage?: string | null;
  onClearPendingMessage?: () => void;
  currentUser: User | null;
  // Novos props para travar a sync externa
  onAiGenerationStart?: () => void;
  onAiGenerationEnd?: () => void;
}

const REASONING_STEPS = [
  "Conectando ao modelo...",           // 0 - 15%
  "Lendo estrutura do projeto...",     // 15 - 30%
  "Analisando requisitos...",          // 30 - 50%
  "Gerando lógica Java...",            // 50 - 70%
  "Escrevendo classes & Config...",    // 70 - 85%
  "Validando sintaxe...",              // 85 - 95% (PAUSA AQUI)
  "Aplicando alterações..."            // 98 - 100%
];

const TIMEOUT_DURATION = 300; // 5 minutos em segundos

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, messages, setMessages, currentProject, fullProject, onProjectGenerated, 
  directoryHandle, onSetDirectoryHandle, pendingMessage, onClearPendingMessage, currentUser,
  onAiGenerationStart, onAiGenerationEnd
}) => {
  const [input, setInput] = useState('');
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  
  // No modo privado, a thread ativa é SEMPRE o ID do usuário atual
  const activeThreadId = currentUser?.id || 'guest';

  // Controle preciso da porcentagem (0 a 100)
  const [progressValue, setProgressValue] = useState(0);
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<{id: string, text: string, att: Attachment[]}[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_DURATION);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Ref para textarea
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- FILTRAGEM ESTRITA DE MENSAGENS (PRIVACIDADE TOTAL) ---
  const threadMessages = useMemo(() => {
      if (!currentUser) return [];
      return messages.filter(m => {
          // Só mostra mensagens onde threadId é igual ao meu ID
          // Se for uma mensagem legada sem threadId, assume que é do dono, então só mostra se eu for o dono
          const tId = m.threadId || (fullProject?.ownerId === currentUser.id ? currentUser.id : 'unknown');
          return tId === currentUser.id;
      });
  }, [messages, currentUser, fullProject]);

  // Detecta se há alguma mensagem com status 'processing' NA MINHA THREAD
  const processingMessage = threadMessages.find(m => m.status === 'processing' && m.role === 'model');

  // Auto-resize do Textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages, progressValue, processingMessage]);

  // --- LÓGICA DE PROGRESSO SINCRONIZADA ---
  useEffect(() => {
    let interval: any;
    
    if (processingMessage) {
        const startTime = processingMessage.timestamp || Date.now();

        interval = setInterval(() => {
            setProgressValue(prev => {
                if (prev >= 98) {
                    setTimeLeft(0); 
                    return prev;
                }

                const now = Date.now();
                const elapsedSeconds = (now - startTime) / 1000;
                const remaining = Math.max(0, TIMEOUT_DURATION - elapsedSeconds);
                
                setTimeLeft(Math.floor(remaining));

                if (remaining <= 0 && isLocalProcessing && abortControllerRef.current) {
                     abortControllerRef.current.abort();
                }

                const estimatedDuration = 45; 
                let calculatedPct = (elapsedSeconds / estimatedDuration) * 95;
                if (calculatedPct > 95) calculatedPct = 95;
                
                return Math.max(prev, calculatedPct);
            });

        }, 200);
    } else {
        if (!isLocalProcessing) {
            setProgressValue(0);
            setTimeLeft(TIMEOUT_DURATION);
        }
    }
    return () => clearInterval(interval);
  }, [processingMessage, isLocalProcessing]); 

  const getCurrentStepText = (pct: number) => {
      if (pct < 15) return REASONING_STEPS[0];
      if (pct < 30) return REASONING_STEPS[1];
      if (pct < 50) return REASONING_STEPS[2];
      if (pct < 70) return REASONING_STEPS[3];
      if (pct < 85) return REASONING_STEPS[4];
      if (pct < 98) return REASONING_STEPS[5]; 
      return REASONING_STEPS[6];
  };

  useEffect(() => {
    if (pendingMessage) {
        handleAddToQueue(pendingMessage);
        if (onClearPendingMessage) onClearPendingMessage();
    }
  }, [pendingMessage]);

  useEffect(() => {
    const processQueue = async () => {
      if (isLocalProcessing || queue.length === 0) return;
      
      // Só processa se não houver msg processando NA MINHA THREAD
      if (threadMessages.some(m => m.status === 'processing')) return;

      const { id, text, att } = queue[0];
      setQueue(prev => prev.slice(1));
      
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'done' as const } : m));
      
      await executeAiGeneration(text, att);
    };
    
    const queueInterval = setInterval(processQueue, 1000);
    return () => clearInterval(queueInterval);
  }, [queue, isLocalProcessing, threadMessages]);

  const executeAiGeneration = async (text: string, currentAttachments: Attachment[], isRetry = false, reuseMsgId?: string) => {
    if (!isRetry) {
        setIsLocalProcessing(true);
        setProgressValue(0); 
        // Avisa a App para pausar sync
        if (onAiGenerationStart) onAiGenerationStart();
    }
    
    setTimeLeft(TIMEOUT_DURATION);
    abortControllerRef.current = new AbortController();
    
    const modelMsgId = reuseMsgId || generateUUID();
    const startTime = Date.now();

    if (!isRetry) {
        setMessages(prev => [
            ...prev, 
            { 
                id: modelMsgId,
                threadId: activeThreadId, // A resposta da IA é sempre na MINHA thread
                role: 'model', 
                text: '', 
                status: 'processing',
                timestamp: startTime, 
                senderName: 'Agente IA'
            }
        ]);
    }

    try {
      const project = await generatePluginCode(
          text, 
          settings, 
          currentProject, 
          currentAttachments, 
          currentUser,
          abortControllerRef.current.signal
      );
      
      setProgressValue(98);
      onProjectGenerated(project);

      await new Promise(r => setTimeout(r, 500));

      if (directoryHandle) {
          await saveProjectToDisk(directoryHandle, project).catch(console.warn);
      }

      setProgressValue(100);

      setMessages(prev => prev.map(m => m.id === modelMsgId ? { 
          ...m, 
          text: project.explanation, 
          projectData: project, 
          status: 'done' 
      } : m));

      if (settings.enableSounds) playSound('success');
      setIsLocalProcessing(false);

    } catch (error: any) {
      if (error.message === 'TIMEOUT' || error.name === 'AbortError') {
          if (error.name === 'AbortError') {
             setMessages(prev => prev.map(m => m.id === modelMsgId ? { 
                 ...m,
                 text: `**Geração Cancelada pelo Usuário.**`, 
                 isError: true, 
                 status: 'done' 
             } : m));
             setIsLocalProcessing(false);
             // Libera sync
             if (onAiGenerationEnd) onAiGenerationEnd();
             return;
          }
          setTimeout(() => {
              executeAiGeneration(text, currentAttachments, true, modelMsgId);
          }, 1000);
          return; 
      }

      setMessages(prev => prev.map(m => m.id === modelMsgId ? { 
          ...m,
          text: `**Erro na Geração:**\n${error.message}`, 
          isError: true, 
          status: 'done' 
      } : m));

      if (settings.enableSounds) playSound('error');
      setIsLocalProcessing(false);
    } finally {
       // Garante que a sync seja liberada no final
       if (onAiGenerationEnd) onAiGenerationEnd();
    }
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsLocalProcessing(false);
          playSound('click');
          if (onAiGenerationEnd) onAiGenerationEnd();
      }
  };

  const handleAddToQueue = (text: string) => {
    if (!text.trim() && attachments.length === 0) return;

    const msgId = generateUUID();
    
    const userMessage: ChatMessage = { 
        id: msgId, 
        threadId: activeThreadId, 
        role: 'user', 
        text, 
        attachments: [...attachments], 
        status: 'queued',
        senderId: currentUser?.id, 
        senderName: currentUser?.username || 'Você'
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQueue(prev => [...prev, { id: msgId, text, att: [...attachments] }]);
    setInput('');
    setAttachments([]);
    
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
    }
  };

  const handleClearThread = async () => {
    if (window.confirm("Limpar seu histórico de conversa?")) {
        setMessages(prev => prev.filter(m => m.threadId !== activeThreadId));
        playSound('click');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddToQueue(input);
    }
  };

  const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => (Math.random() * 16 | (c === 'x' ? 0 : 0x8)).toString(16));

  const displayPercent = Math.min(100, Math.floor(progressValue));
  const currentStepText = getCurrentStepText(displayPercent);

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] relative min-w-0">
      
      {/* HEADER: Apenas título simples, sem abas de outros usuários */}
      <div className="bg-[#252526] border-b border-[#333] px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
         <div className="flex items-center gap-2">
             <Bot className="w-4 h-4 text-mc-accent" />
             <span className="text-sm font-bold text-gray-200">Seu Agente Pessoal</span>
         </div>
         {threadMessages.length > 0 && (
            <button 
                onClick={handleClearThread}
                className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-red-900/20 rounded transition-colors"
                title="Limpar Chat"
            >
                <Trash2 className="w-4 h-4" />
            </button>
         )}
      </div>

      {/* MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar relative">
        {threadMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2 opacity-50 select-none">
                <Bot className="w-12 h-12 mb-2" />
                <p className="text-sm font-medium">Olá, {currentUser?.username}</p>
                <p className="text-xs">Estou pronto para ajudar no código.</p>
            </div>
        ) : (
            threadMessages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 mt-1 shadow-md ${msg.role === 'model' ? (msg.isError ? 'bg-red-600' : 'bg-[#007acc]') : 'bg-gray-700 border border-gray-600'}`}>
                {msg.role === 'model' ? (msg.isError ? <AlertCircle className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />) : <UserIcon className="w-4 h-4 text-white" />}
                </div>
                
                <div className={`max-w-[85%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{msg.senderName || (msg.role === 'model' ? 'Agente IA' : 'Você')}</span>
                </div>
                
                {msg.role === 'model' && msg.status === 'processing' ? (
                    <div className="flex gap-3 animate-fade-in w-full">
                        <div className="bg-[#252526] border border-[#333] rounded-lg p-3 w-64 shadow-lg">
                            <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-mc-accent flex items-center gap-2">
                                    <Loader2 className={`w-3 h-3 ${displayPercent < 100 ? 'animate-spin' : ''}`} /> 
                                    {displayPercent >= 100 ? "Concluído" : `Gerando... ${displayPercent}%`}
                                </span>
                                
                                {displayPercent < 100 && isLocalProcessing && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleStopGeneration(); }}
                                        className="text-gray-500 hover:text-red-400 transition-colors p-1 bg-black/20 rounded hover:bg-red-900/30 ml-2"
                                        title="Cancelar Geração"
                                    >
                                        <StopCircle className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <span className="text-[10px] text-gray-500">{currentStepText}</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                            <div 
                                className="h-full bg-mc-accent transition-all duration-300 ease-linear"
                                style={{ width: `${displayPercent}%` }}
                            ></div>
                            </div>
                            
                            <div className="flex items-center justify-end gap-1.5 text-[10px] text-gray-400 font-mono bg-black/20 py-1 px-2 rounded">
                                {displayPercent >= 100 ? (
                                    <span className="text-mc-green flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Processamento Concluído
                                    </span>
                                ) : (
                                    <>
                                        {displayPercent >= 95 && displayPercent < 98 && (
                                            <span className="text-mc-gold flex items-center gap-1 animate-pulse mr-2 border-r border-gray-600 pr-2">
                                            <HardDrive className="w-3 h-3" /> Aguardando API...
                                            </span>
                                        )}
                                        <Timer className="w-3 h-3" />
                                        <span>Tempo: <span className={timeLeft < 60 ? 'text-red-400' : 'text-white'}>{formatTime(timeLeft)}</span></span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className={`px-4 py-2.5 rounded-lg text-sm shadow-sm relative ${msg.role === 'user' ? 'bg-[#264f78] text-white' : 'bg-[#252526] text-[#cccccc] border border-[#333]'} ${msg.isError ? 'border-red-500/50 bg-red-900/20 text-red-200' : ''}`}>
                        <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                        {msg.status === 'queued' && <div className="absolute -bottom-5 right-0 text-[10px] text-gray-500 bg-black/40 px-1.5 rounded-full"><Clock className="w-3 h-3 inline mr-1" /> Na Fila</div>}
                    </div>
                )}
                </div>
            </div>
            ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div className="p-3 bg-[#1e1e1e] border-t border-[#333] shrink-0">
        {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachments.map((att, i) => (
            <div key={i} className="relative bg-[#2d2d2d] rounded p-2 flex items-center gap-2 border border-[#444] shrink-0">
                <FileText className="w-5 h-5 text-mc-accent" />
                <span className="text-[10px] text-gray-300 max-w-[80px] truncate">{att.name}</span>
                <button onClick={() => setAttachments(p => p.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
            </div>
            ))}
        </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); handleAddToQueue(input); }} className="flex gap-2 items-end">
        
        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
            const files = Array.from(e.target.files || []) as File[];
            files.forEach(f => {
            const r = new FileReader();
            r.onload = () => setAttachments(p => [...p, { type: 'text', name: f.name, content: r.result as string }]);
            r.readAsText(f);
            });
        }} />
        
        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-gray-400 hover:text-white transition-colors mb-0.5"><Paperclip className="w-5 h-5" /></button>
        
        {processingMessage && isLocalProcessing ? (
            <>
                <div className="flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-gray-400 opacity-70 cursor-not-allowed">
                    Aguarde a resposta da IA...
                </div>
                
                <button 
                type="submit" 
                disabled={!input.trim()} 
                className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 border border-gray-600 disabled:opacity-50"
                title="Adicionar à Fila"
                >
                <ListPlus className="w-4 h-4" />
                </button>
            </>
        ) : (
            <>
                <textarea
                    ref={textareaRef}
                    value={input} 
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Instrua seu Agente... (Shift+Enter para nova linha)" 
                    rows={1}
                    className="flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-mc-accent resize-none custom-scrollbar min-h-[42px] max-h-[150px]" 
                />
                <button 
                type="submit" 
                disabled={!input.trim() && attachments.length === 0} 
                className="bg-mc-accent hover:bg-blue-600 px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed h-[42px] mb-[1px]"
                >
                <Send className="w-4 h-4 text-white" />
                </button>
            </>
        )}
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
