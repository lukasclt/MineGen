
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User, SavedProject } from '../types';
import { Send, Bot, User as UserIcon, AlertCircle, Trash2, Loader2, CheckCircle2, FileText, Paperclip, X, Clock, Shield, Timer, HardDrive, StopCircle, ListPlus, Users, Eye } from 'lucide-react';
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
  directoryHandle, onSetDirectoryHandle, pendingMessage, onClearPendingMessage, currentUser
}) => {
  const [input, setInput] = useState('');
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  
  // Controle de Threads (Chats por Usuário)
  const [activeThreadId, setActiveThreadId] = useState<string>(currentUser?.id || 'global');

  // Garante que se o usuário mudar (login/logout), a thread ativa muda
  useEffect(() => {
    if (currentUser) {
        setActiveThreadId(currentUser.id);
    }
  }, [currentUser?.id]);
  
  // Controle preciso da porcentagem (0 a 100)
  const [progressValue, setProgressValue] = useState(0);
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<{id: string, text: string, att: Attachment[]}[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_DURATION);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- FILTRAGEM DE MENSAGENS POR THREAD ---
  const threadMessages = useMemo(() => {
      return messages.filter(m => {
          // Retrocompatibilidade: Mensagens sem threadId vão para o owner ou para a thread atual se for vazia
          const tId = m.threadId || fullProject?.ownerId || 'global';
          return tId === activeThreadId;
      });
  }, [messages, activeThreadId, fullProject]);

  // CRÍTICO: Detecta se há alguma mensagem com status 'processing' NA THREAD ATUAL
  const processingMessage = threadMessages.find(m => m.status === 'processing' && m.role === 'model');

  // --- LISTA DE MEMBROS PARA ABAS ---
  const threadList = useMemo(() => {
     const list: { id: string, label: string, role: string }[] = [];
     
     if (fullProject) {
        // Dono
        list.push({ 
            id: fullProject.ownerId, 
            label: fullProject.ownerName || 'Dono',
            role: 'admin'
        });
        
        // Membros
        (fullProject.members || []).forEach(email => {
             // Tenta achar o nome nos metadados das mensagens ou usa o email
             const senderMsg = messages.find(m => m.senderName && (m.threadId === email || m.senderId === email)); // Lógica simplificada
             // Idealmente, SavedProject teria info de usuários, mas vamos usar o email/id como chave
             // Como members é array de emails, precisamos mapear para ID se possível, ou usar email como ID de thread fake
             // Mas o sistema usa User ID. Vamos assumir que members podem ter threads se já mandaram msg.
        });
        
        // Adiciona threads que existem nas mensagens mas não estão na lista explicita (casos de convidados antigos)
        const uniqueThreads = Array.from(new Set(messages.map(m => m.threadId).filter(Boolean)));
        uniqueThreads.forEach(tId => {
            if (!list.find(i => i.id === tId)) {
                const sample = messages.find(m => m.threadId === tId);
                list.push({
                    id: tId as string,
                    label: sample?.senderName || 'Desconhecido',
                    role: 'editor'
                });
            }
        });
     }
     
     // Garante que EU estou na lista mesmo se não mandei msg
     if (currentUser && !list.find(i => i.id === currentUser.id)) {
         list.push({ id: currentUser.id, label: currentUser.username, role: 'me' });
     }

     return list;
  }, [fullProject, messages, currentUser]);

  const isMyThread = currentUser && activeThreadId === currentUser.id;


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
        // Se mudou de thread e a nova não está processando, reseta visual
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
        // Se receber código para inserir, força a troca para MINHA thread
        if (currentUser && activeThreadId !== currentUser.id) {
            setActiveThreadId(currentUser.id);
        }
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
                threadId: activeThreadId, // VINCULA AO USUÁRIO ATUAL
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
    }
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsLocalProcessing(false);
          playSound('click');
      }
  };

  const handleAddToQueue = (text: string) => {
    if (!text.trim() && attachments.length === 0) return;
    if (!isMyThread) return; // Segurança extra

    const msgId = generateUUID();
    
    const userMessage: ChatMessage = { 
        id: msgId, 
        threadId: activeThreadId, // ID DO USUÁRIO
        role: 'user', 
        text, 
        attachments: [...attachments], 
        status: 'queued',
        senderId: currentUser?.id, 
        senderName: currentUser?.username || 'Convidado'
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQueue(prev => [...prev, { id: msgId, text, att: [...attachments] }]);
    setInput('');
    setAttachments([]);
  };

  const handleClearThread = async () => {
    if (window.confirm("Limpar histórico DESTA conversa? Isso não afeta outros membros.")) {
        // Remove apenas mensagens desta thread
        setMessages(prev => prev.filter(m => m.threadId !== activeThreadId));
        playSound('click');
        // O App.tsx vai lidar com o salvamento no próximo ciclo
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
    <div className="flex flex-col h-full bg-[#1e1e1e] relative">
      
      {/* HEADER: Thread Switcher */}
      <div className="bg-[#252526] border-b border-[#333] px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 h-14">
         <span className="text-[10px] font-bold text-gray-500 uppercase shrink-0 mr-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Agentes:
         </span>
         
         {threadList.map((thread) => {
            const isActive = activeThreadId === thread.id;
            const isMe = currentUser && thread.id === currentUser.id;
            
            return (
                <button
                   key={thread.id}
                   onClick={() => setActiveThreadId(thread.id)}
                   className={`
                      relative group flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all min-w-[120px]
                      ${isActive 
                          ? 'bg-gray-800 border-mc-accent shadow-md' 
                          : 'bg-[#1e1e1e] border-[#333] hover:border-gray-600 opacity-70 hover:opacity-100'}
                   `}
                >
                   <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${isActive ? 'bg-mc-accent text-white' : 'bg-gray-700 text-gray-400'}`}>
                       {thread.label[0].toUpperCase()}
                   </div>
                   <div className="flex flex-col items-start min-w-0">
                       <span className={`text-xs font-medium truncate max-w-[80px] ${isActive ? 'text-white' : 'text-gray-400'}`}>
                           {thread.label} {isMe && '(Você)'}
                       </span>
                   </div>
                   {isActive && (
                       <div className="absolute top-0 right-0 w-2 h-2 bg-mc-green rounded-full border border-[#252526]"></div>
                   )}
                </button>
            );
         })}
      </div>

      {/* Botão Flutuante de Limpar Chat (Thread Atual) */}
      {threadMessages.length > 0 && isMyThread && (
          <button 
             onClick={handleClearThread}
             className="absolute top-16 right-4 z-10 p-1.5 bg-[#252526] hover:bg-red-900/40 text-gray-500 hover:text-red-400 rounded-md border border-[#333] hover:border-red-500/30 transition-all shadow-lg"
             title="Limpar Esta Conversa"
          >
             <Trash2 className="w-4 h-4" />
          </button>
      )}

      {/* MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {threadMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-2 opacity-50">
                <Bot className="w-12 h-12 mb-2" />
                <p className="text-sm font-medium">Chat do Agente de {threadList.find(t => t.id === activeThreadId)?.label}</p>
                <p className="text-xs">Inicie uma conversa para gerar código.</p>
            </div>
        ) : (
            threadMessages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 mt-1 shadow-md ${msg.role === 'model' ? (msg.isError ? 'bg-red-600' : 'bg-[#007acc]') : 'bg-gray-700 border border-gray-600'}`}>
                {msg.role === 'model' ? (msg.isError ? <AlertCircle className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />) : <UserIcon className="w-4 h-4 text-white" />}
                </div>
                
                <div className={`max-w-[85%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{msg.senderName || (msg.role === 'model' ? 'Agente IA' : 'Usuário')}</span>
                    {msg.role === 'user' && msg.senderId && <Shield className="w-2.5 h-2.5 text-mc-accent" />}
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
                                
                                {displayPercent < 100 && isLocalProcessing && isMyThread && (
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
                        <div className="whitespace-pre-wrap">{msg.text}</div>
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
      <div className="p-3 bg-[#1e1e1e] border-t border-[#333]">
        {isMyThread ? (
             /* MODO EDITOR: POSSO ESCREVER */
            <>
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
                <form onSubmit={(e) => { e.preventDefault(); handleAddToQueue(input); }} className="flex gap-2 items-center">
                
                <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
                    const files = Array.from(e.target.files || []) as File[];
                    files.forEach(f => {
                    const r = new FileReader();
                    r.onload = () => setAttachments(p => [...p, { type: 'text', name: f.name, content: r.result as string }]);
                    r.readAsText(f);
                    });
                }} />
                
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white transition-colors"><Paperclip className="w-5 h-5" /></button>
                
                {processingMessage && isLocalProcessing ? (
                    <>
                        <input 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="Adicionar à fila..." 
                        className="flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 text-sm text-white outline-none focus:border-mc-accent" 
                        />
                        
                        <button 
                        type="submit" 
                        disabled={!input.trim()} 
                        className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 border border-gray-600 disabled:opacity-50"
                        title="Adicionar à Fila"
                        >
                        <ListPlus className="w-4 h-4" />
                        </button>
                    </>
                ) : (
                    <>
                        <input 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="Instrua o Agente..." 
                        className="flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 text-sm text-white outline-none focus:border-mc-accent" 
                        />
                        <button 
                        type="submit" 
                        disabled={!input.trim() && attachments.length === 0} 
                        className="bg-mc-accent hover:bg-blue-600 px-4 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                        <Send className="w-4 h-4 text-white" />
                        </button>
                    </>
                )}
                </form>
            </>
        ) : (
             /* MODO ESPECTADOR: SOMENTE LEITURA */
             <div className="flex items-center justify-center gap-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700 text-gray-400 text-xs italic">
                 <Eye className="w-4 h-4" />
                 Você está visualizando o chat de {threadList.find(t => t.id === activeThreadId)?.label}. (Somente Leitura)
             </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
