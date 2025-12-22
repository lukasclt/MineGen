
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User, SavedProject } from '../types';
import { Send, Bot, User as UserIcon, Cpu, AlertCircle, Trash2, Loader2, CheckCircle2, FileText, Image as ImageIcon, Paperclip, X, RefreshCw, Lock, Volume2, StopCircle, Clock, Hourglass, Shield, HardDrive, Timer } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';
import { saveProjectToDisk, readProjectFromDisk, saveProjectStateToDisk } from '../services/fileSystem';
import { playSound, stopSpeech } from '../services/audioService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  currentProject: GeneratedProject | null;
  fullProject: SavedProject | null; // Adicionado para acesso ao objeto completo para salvamento
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
  "Finalizando e Salvando..."          // 98 - 100%
];

const TIMEOUT_DURATION = 300; // 5 minutos em segundos

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, messages, setMessages, currentProject, fullProject, onProjectGenerated, 
  directoryHandle, onSetDirectoryHandle, pendingMessage, onClearPendingMessage, currentUser
}) => {
  const [input, setInput] = useState('');
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  
  // Substitui reasoningStep simples por um valor percentual preciso
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

  // --- PROGRESSO VISUAL ORGÂNICO ---
  useEffect(() => {
    let interval: any;
    
    if (processingMessage) {
        interval = setInterval(() => {
            setProgressValue(prev => {
                // Se já passou de 95 (definido manualmente quando a resposta chega), não mexe
                if (prev >= 95) return prev;
                
                // Incremento variável para parecer "pensamento"
                // Desacelera conforme chega perto de 95%
                let increment = 0;
                if (prev < 30) increment = 2; // Rápido no início
                else if (prev < 60) increment = 1; // Médio
                else if (prev < 80) increment = 0.5; // Mais lento
                else if (prev < 95) increment = 0.2; // Muito lento esperando a API

                const next = prev + increment;
                return next >= 95 ? 95 : next; // Trava em 95% até a API responder
            });
        }, 300);
    } else {
        // Se não está processando e não acabou de terminar (para não piscar 0 antes de sumir)
        if (!isLocalProcessing) {
            setProgressValue(0);
        }
    }
    return () => clearInterval(interval);
  }, [processingMessage, isLocalProcessing]); 

  // Calcula qual texto mostrar baseado na porcentagem atual
  const getCurrentStepText = (pct: number) => {
      if (pct < 15) return REASONING_STEPS[0];
      if (pct < 30) return REASONING_STEPS[1];
      if (pct < 50) return REASONING_STEPS[2];
      if (pct < 70) return REASONING_STEPS[3];
      if (pct < 85) return REASONING_STEPS[4];
      if (pct < 98) return REASONING_STEPS[5]; // Validando sintaxe... (Fica aqui nos 95%)
      return REASONING_STEPS[6]; // Finalizando (98%+)
  };

  // --- TIMER E TIMEOUT LOGIC ---
  useEffect(() => {
      let timer: any;
      
      if (isLocalProcessing) {
          timer = setInterval(() => {
              setTimeLeft(prev => {
                  if (prev <= 1) {
                      // TIMEOUT ATINGIDO - ABORTAR PARA REINICIAR
                      if (abortControllerRef.current) {
                          console.log("Tempo esgotado (5m). Cancelando para reiniciar...");
                          abortControllerRef.current.abort(); // Dispara o erro 'AbortError' no fetch
                      }
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else {
          setTimeLeft(TIMEOUT_DURATION);
      }

      return () => clearInterval(timer);
  }, [isLocalProcessing]);

  useEffect(() => {
    if (pendingMessage) {
        handleAddToQueue(pendingMessage);
        if (onClearPendingMessage) onClearPendingMessage();
    }
  }, [pendingMessage]);

  useEffect(() => {
    const processQueue = async () => {
      if (isLocalProcessing || queue.length === 0) return;
      
      const { id, text, att } = queue[0];
      setQueue(prev => prev.slice(1));
      
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'done' as const } : m));
      
      // Passa o ID da mensagem para que possamos reutilizá-lo em caso de retry se quisermos (ou criar novos)
      // Aqui vamos criar uma nova mensagem de resposta
      await executeAiGeneration(text, att);
    };
    processQueue();
  }, [queue, isLocalProcessing]);

  const executeAiGeneration = async (text: string, currentAttachments: Attachment[], isRetry = false, reuseMsgId?: string) => {
    if (!isRetry) {
        setIsLocalProcessing(true);
        setProgressValue(0); // Reset visual
    }
    
    setTimeLeft(TIMEOUT_DURATION); // Reseta o timer visual e lógico
    
    // Cria novo controlador para esta tentativa
    abortControllerRef.current = new AbortController();
    
    const modelMsgId = reuseMsgId || generateUUID();

    if (!isRetry) {
        // 1. INSERE O PLACEHOLDER 'PROCESSING' NO ESTADO GLOBAL APENAS NA PRIMEIRA VEZ
        setMessages(prev => [
            ...prev, 
            { 
                id: modelMsgId,
                role: 'model', 
                text: '', 
                status: 'processing', // Gatilho visual
                senderName: 'Agente IA'
            }
        ]);
    } else {
        console.log(`[Auto-Retry] Reiniciando tentativa de geração...`);
    }

    try {
      const project = await generatePluginCode(
          text, 
          settings, 
          currentProject, 
          currentAttachments, 
          currentUser,
          abortControllerRef.current.signal // Passa o sinal
      );
      
      // --- CHEGOU A RESPOSTA (O fetch passou) ---
      // Pula para 98% para indicar "Processando arquivos..."
      setProgressValue(98);

      // Atualiza o projeto no estado global
      onProjectGenerated(project);

      // Pequeno delay para usuário ver o "Finalizando..."
      await new Promise(r => setTimeout(r, 600));

      // 3. SALVAMENTO NO DISCO
      if (directoryHandle) {
          await saveProjectToDisk(directoryHandle, project)
             .then(() => console.log("Projeto salvo no disco com sucesso."))
             .catch(e => console.warn("Erro ao salvar no disco (background):", e));
      }

      // Finaliza 100%
      setProgressValue(100);

      // 2. ATUALIZA PARA 'DONE' COM O RESULTADO
      setMessages(prev => prev.map(m => m.id === modelMsgId ? { 
          ...m, 
          text: project.explanation, 
          projectData: project, 
          status: 'done' 
      } : m));

      if (settings.enableSounds) playSound('success');
      setIsLocalProcessing(false);

    } catch (error: any) {
      // --- LÓGICA DE LOOP DE RETENTATIVA ---
      if (error.message === 'TIMEOUT' || error.name === 'AbortError') {
          // Não define status como done, não para o processamento.
          // Chama recursivamente a função.
          setTimeout(() => {
              executeAiGeneration(text, currentAttachments, true, modelMsgId);
          }, 1000);
          return; 
      }

      // Erro real (não timeout)
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
    if (window.confirm("Tem certeza que deseja limpar todo o histórico de conversas deste projeto? Isso afetará o arquivo .minegen.")) {
        // 1. Atualiza visualmente (React State)
        setMessages([]);
        playSound('click');

        // 2. Atualiza fisicamente (.minegen/state.json) se houver handle e projeto
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

  // Arredonda para exibição (ex: 95.333 -> 95)
  const displayPercent = Math.min(100, Math.floor(progressValue));
  const currentStepText = getCurrentStepText(displayPercent);

  // Helper para formatar tempo mm:ss
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
              
              {/* RENDERIZAÇÃO DA BARRA DE PROGRESSO SINCRONIZADA */}
              {msg.role === 'model' && msg.status === 'processing' ? (
                  <div className="flex gap-3 animate-fade-in w-full">
                     <div className="bg-[#252526] border border-[#333] rounded-lg p-3 w-64 shadow-lg">
                        <div className="flex items-center justify-between mb-2">
                           <span className="text-xs font-bold text-mc-accent flex items-center gap-2">
                             <Loader2 className="w-3 h-3 animate-spin" /> 
                             {displayPercent >= 100 ? "Concluído" : `Gerando... ${displayPercent}%`}
                           </span>
                           <span className="text-[10px] text-gray-500">{currentStepText}</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                           <div 
                             className="h-full bg-mc-accent transition-all duration-300 ease-linear"
                             style={{ width: `${displayPercent}%` }}
                           ></div>
                        </div>
                        {/* TIMER DISPLAY - Oculta quando está em 100% para não confundir */}
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-gray-400 font-mono bg-black/20 py-1 px-2 rounded">
                            {displayPercent >= 100 ? (
                                <span className="text-mc-green flex items-center gap-1">
                                   <CheckCircle2 className="w-3 h-3" /> Processamento Concluído
                                </span>
                            ) : (
                                <>
                                    <Timer className="w-3 h-3" />
                                    <span>Tempo Restante: <span className={timeLeft < 60 ? 'text-red-400' : 'text-white'}>{formatTime(timeLeft)}</span></span>
                                    {timeLeft === 0 && <span className="text-mc-gold ml-1 animate-pulse">(Reiniciando...)</span>}
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
        <form onSubmit={(e) => { e.preventDefault(); handleAddToQueue(input); }} className="flex gap-2">
          <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => {
            const files = Array.from(e.target.files || []) as File[];
            files.forEach(f => {
              const r = new FileReader();
              r.onload = () => setAttachments(p => [...p, { type: 'text', name: f.name, content: r.result as string }]);
              r.readAsText(f);
            });
          }} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white transition-colors"><Paperclip className="w-5 h-5" /></button>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Instrua o Agente ou Colaboradores..." className="flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 text-sm text-white outline-none focus:border-mc-accent" />
          <button type="submit" disabled={!input.trim()} className="bg-mc-accent hover:bg-blue-600 px-4 rounded-lg transition-colors flex items-center justify-center"><Send className="w-4 h-4 text-white" /></button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
