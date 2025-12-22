
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User, SavedProject } from '../types';
import { Send, Bot, User as UserIcon, AlertCircle, Trash2, Loader2, CheckCircle2, FileText, Paperclip, X, Clock, Shield, Timer, HardDrive, StopCircle, ListPlus } from 'lucide-react';
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
  
  // Controle preciso da porcentagem (0 a 100)
  const [progressValue, setProgressValue] = useState(0);
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<{id: string, text: string, att: Attachment[]}[]>([]);
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_DURATION);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // CRÍTICO: Detecta se há alguma mensagem com status 'processing' no array de mensagens sincronizado.
  const processingMessage = messages.find(m => m.status === 'processing' && m.role === 'model');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, progressValue, processingMessage]);

  // --- LÓGICA DE PROGRESSO SINCRONIZADA (Baseada em Timestamp) ---
  useEffect(() => {
    let interval: any;
    
    if (processingMessage) {
        // Se a mensagem tiver timestamp, usamos ele para calcular o tempo real decorrido
        // Isso garante sincronia entre Admin e Editores
        const startTime = processingMessage.timestamp || Date.now();

        interval = setInterval(() => {
            // VERIFICAÇÃO CRÍTICA: Se já atingiu 98% (IA respondeu), paramos o timer imediatamente.
            // Usamos o state updater para garantir que lemos o valor mais recente.
            setProgressValue(prev => {
                if (prev >= 98) {
                    setTimeLeft(0); // Zera o timer visualmente pois já acabou a espera
                    return prev;
                }

                // Lógica de tempo normal enquanto espera ( < 98% )
                const now = Date.now();
                const elapsedSeconds = (now - startTime) / 1000;
                const remaining = Math.max(0, TIMEOUT_DURATION - elapsedSeconds);
                
                setTimeLeft(Math.floor(remaining));

                // Auto-cancelamento se estourar o tempo (apenas para quem está processando localmente)
                if (remaining <= 0 && isLocalProcessing && abortControllerRef.current) {
                     console.log("Timeout atingido. Reiniciando...");
                     abortControllerRef.current.abort();
                }

                // Cálculo de porcentagem baseado no tempo estimado vs decorrido
                // Estimativa: uma geração média leva cerca de 45 segundos para chegar a 95%
                const estimatedDuration = 45; 
                let calculatedPct = (elapsedSeconds / estimatedDuration) * 95;
                
                // Limita a 95% até receber resposta real da API
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

  // Texto descritivo baseado na porcentagem
  const getCurrentStepText = (pct: number) => {
      if (pct < 15) return REASONING_STEPS[0];
      if (pct < 30) return REASONING_STEPS[1];
      if (pct < 50) return REASONING_STEPS[2];
      if (pct < 70) return REASONING_STEPS[3];
      if (pct < 85) return REASONING_STEPS[4];
      if (pct < 98) return REASONING_STEPS[5]; // "Validando sintaxe..." (Fica aqui nos 95%)
      return REASONING_STEPS[6]; // "Aplicando alterações..." (98%+)
  };

  useEffect(() => {
    if (pendingMessage) {
        handleAddToQueue(pendingMessage);
        if (onClearPendingMessage) onClearPendingMessage();
    }
  }, [pendingMessage]);

  useEffect(() => {
    const processQueue = async () => {
      // Só processa a fila se NÃO estiver processando nada localmente
      if (isLocalProcessing || queue.length === 0) return;
      
      // Verifica se já existe uma mensagem de 'processing' global (de outro usuário)
      // Se sim, esperamos.
      if (messages.some(m => m.status === 'processing')) return;

      const { id, text, att } = queue[0];
      setQueue(prev => prev.slice(1));
      
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'done' as const } : m));
      
      await executeAiGeneration(text, att);
    };
    
    // Verifica periodicamente se pode processar a fila
    const queueInterval = setInterval(processQueue, 1000);
    return () => clearInterval(queueInterval);
  }, [queue, isLocalProcessing, messages]);

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
                role: 'model', 
                text: '', 
                status: 'processing',
                timestamp: startTime, // TIMESTAMP PARA SINCRONIZAÇÃO
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
      
      // --- RESPOSTA RECEBIDA ---
      // Setamos 98 imediatamente. O useEffect vai detectar isso e zerar o timer.
      setProgressValue(98);

      onProjectGenerated(project);

      await new Promise(r => setTimeout(r, 500));

      if (directoryHandle) {
          await saveProjectToDisk(directoryHandle, project)
             .then(() => console.log("Projeto salvo no disco com sucesso."))
             .catch(e => console.warn("Erro ao salvar no disco (background):", e));
      }

      // --- FINALIZAÇÃO ---
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
          // Se foi abortado manualmente, não tentamos novamente
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

          // Timeout automático tenta de novo
          setTimeout(() => {
              executeAiGeneration(text, currentAttachments, true, modelMsgId);
          }, 1000);
          return; 
      }

      setMessages(prev => prev.map(m => m.id === modelMsgId ? { 
          ...m,
          text: `**Erro na Geração:**\n${error.message}\n\n*Verifique se a chave API é válida ou tente outro modelo.*`, 
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
    const msgId = generateUUID();
    
    const userMessage: ChatMessage = { 
        id: msgId, role: 'user', text, attachments: [...attachments], status: 'queued',
        senderId: currentUser?.id, senderName: currentUser?.username || 'Convidado'
    };
    
    setMessages(prev => [...prev, userMessage]);
    setQueue(prev => [...prev, { id: msgId, text, att: [...attachments] }]);
    setInput('');
    setAttachments([]);
  };

  const handleClearChat = async () => {
    if (window.confirm("Tem certeza que deseja limpar todo o histórico de conversas deste projeto? Isso afetará o arquivo .minegen para todos os membros.")) {
        setMessages([]);
        playSound('click');

        if (directoryHandle && fullProject) {
            try {
                const updatedProject: SavedProject = {
                    ...fullProject,
                    messages: [], 
                    lastModified: Date.now()
                };
                await saveProjectStateToDisk(directoryHandle, updatedProject);
                console.log("Histórico limpo e sincronizado com .minegen/state.json");
            } catch (e) {
                console.error("Erro ao salvar limpeza no disco:", e);
            }
        }
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
      {/* Botão Flutuante de Limpar Chat */}
      {messages.length > 0 && (
          <button 
             onClick={handleClearChat}
             className="absolute top-2 right-4 z-10 p-1.5 bg-[#252526] hover:bg-red-900/40 text-gray-500 hover:text-red-400 rounded-md border border-[#333] hover:border-red-500/30 transition-all shadow-lg"
             title="Limpar Histórico e Salvar no .minegen"
          >
             <Trash2 className="w-4 h-4" />
          </button>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        {messages.map((msg, idx) => (
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
                               
                               {/* BOTÃO DE PARAR DENTRO DO CARD */}
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
                                /* ESTADO COM TIMER */
                                <>
                                    {/* Se está em 95% ou mais, mostra estado de espera, mas com timer ZERADO se já respondeu (98%) */}
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
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-[#1e1e1e] border-t border-[#333]">
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
          
          {/* INPUT AREA */}
          <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
            const files = Array.from(e.target.files || []) as File[];
            files.forEach(f => {
              const r = new FileReader();
              r.onload = () => setAttachments(p => [...p, { type: 'text', name: f.name, content: r.result as string }]);
              r.readAsText(f);
            });
          }} />
          
          {/* CLIP BUTTON */}
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white transition-colors"><Paperclip className="w-5 h-5" /></button>
          
          {/* SE ESTIVER PROCESSANDO: INPUT PARA FILA */}
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
             /* ESTADO NORMAL */
             <>
                <input 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  placeholder="Instrua o Agente ou Colaboradores..." 
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
      </div>
    </div>
  );
};

export default ChatInterface;
