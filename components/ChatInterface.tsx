
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User } from '../types';
import { Send, Bot, User as UserIcon, Cpu, AlertCircle, Trash2, Loader2, CheckCircle2, FileText, Image as ImageIcon, Paperclip, X, RefreshCw, Lock, Volume2, StopCircle, Clock, Hourglass, Shield, HardDrive } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';
import { saveProjectToDisk, readProjectFromDisk } from '../services/fileSystem';
import { playSound, speakText, stopSpeech } from '../services/audioService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  currentProject: GeneratedProject | null;
  onProjectGenerated: (project: any) => void;
  directoryHandle: any;
  onSetDirectoryHandle: (handle: any) => void;
  pendingMessage?: string | null;
  onClearPendingMessage?: () => void;
  currentUser: User | null;
}

const REASONING_STEPS = [
  "Conectando ao modelo...",
  "Lendo estrutura do projeto...",
  "Analisando requisitos...",
  "Gerando lógica...",
  "Escrevendo classes...",
  "Formatando resposta...",
  "Finalizando..."
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, messages, setMessages, currentProject, onProjectGenerated, 
  directoryHandle, onSetDirectoryHandle, pendingMessage, onClearPendingMessage, currentUser
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [reasoningStep, setReasoningStep] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [queue, setQueue] = useState<{id: string, text: string, att: Attachment[]}[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, reasoningStep]);

  useEffect(() => {
    if (pendingMessage) {
        handleAddToQueue(pendingMessage);
        if (onClearPendingMessage) onClearPendingMessage();
    }
  }, [pendingMessage]);

  useEffect(() => {
    const processQueue = async () => {
      if (isLoading || queue.length === 0) return;
      const { id, text, att } = queue[0];
      setQueue(prev => prev.slice(1));
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'processing' as const } : m));
      await executeAiGeneration(text, att, id);
    };
    processQueue();
  }, [queue, isLoading]);

  const executeAiGeneration = async (text: string, currentAttachments: Attachment[], messageId?: string) => {
    setIsLoading(true);
    setReasoningStep(0);
    
    const stepInterval = setInterval(() => {
        setReasoningStep(prev => {
            if (prev < REASONING_STEPS.length - 1) return prev + 1;
            return prev;
        });
    }, 1500);

    try {
      const project = await generatePluginCode(text, settings, currentProject, currentAttachments, currentUser);
      clearInterval(stepInterval);
      setReasoningStep(REASONING_STEPS.length - 1); 
      
      let saveWarning = "";
      
      // Tenta salvar, mas não bloqueia se falhar (ex: falta de permissão no F5)
      if (directoryHandle) {
        try {
            await saveProjectToDisk(directoryHandle, project);
        } catch (saveError: any) {
            console.warn("Falha no salvamento automático:", saveError);
            saveWarning = "\n\n⚠️ **Aviso:** O código foi gerado mas não pôde ser salvo no disco automaticamente. Verifique se a pasta está conectada (ícone amarelo no topo).";
        }
      }

      onProjectGenerated(project);

      setMessages((prev: ChatMessage[]): ChatMessage[] => {
        const updated = prev.map(m => m.id === messageId ? { ...m, status: 'done' as const } : m);
        const modelResponse: ChatMessage = { 
            role: 'model', 
            text: project.explanation + saveWarning, 
            projectData: project, 
            status: 'done' 
        };
        return [...updated, modelResponse];
      });

      if (settings.enableSounds) playSound('success');
      if (settings.enableTTS) speakText(project.explanation);

    } catch (error: any) {
      clearInterval(stepInterval);
      setMessages(prev => {
        const updated = prev.map(m => m.id === messageId ? { ...m, status: 'done' as const, isError: true } : m);
        return [...updated, { 
            role: 'model', 
            text: `**Erro na Geração:**\n${error.message}\n\n*Verifique se a chave API é válida ou tente outro modelo.*`, 
            isError: true, 
            status: 'done' 
        }];
      });
      if (settings.enableSounds) playSound('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToQueue = (text: string) => {
    if (!text.trim() && attachments.length === 0) return;
    const msgId = Date.now().toString();
    const userMessage: ChatMessage = { 
        id: msgId, role: 'user', text, attachments: [...attachments], status: 'queued',
        senderId: currentUser?.id, senderName: currentUser?.username || 'Convidado'
    };
    setMessages(prev => [...prev, userMessage]);
    setQueue(prev => [...prev, { id: msgId, text, att: [...attachments] }]);
    setInput('');
    setAttachments([]);
  };

  const progressPercent = Math.min(100, Math.round(((reasoningStep + 1) / REASONING_STEPS.length) * 100));

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] relative">
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
              <div className={`px-4 py-2.5 rounded-lg text-sm shadow-sm relative ${msg.role === 'user' ? 'bg-[#264f78] text-white' : 'bg-[#252526] text-[#cccccc] border border-[#333]'} ${msg.isError ? 'border-red-500/50 bg-red-900/20 text-red-200' : ''}`}>
                <div className="whitespace-pre-wrap">{msg.text}</div>
                {msg.status === 'queued' && <div className="absolute -bottom-5 right-0 text-[10px] text-gray-500 bg-black/40 px-1.5 rounded-full"><Clock className="w-3 h-3 inline mr-1" /> Na Fila</div>}
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3 animate-fade-in">
             <div className="w-8 h-8 rounded bg-[#007acc] flex items-center justify-center mt-1 animate-pulse"><Cpu className="w-5 h-5 text-white" /></div>
             <div className="bg-[#252526] border border-[#333] rounded-lg p-3 w-64 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-bold text-mc-accent flex items-center gap-2">
                     <Loader2 className="w-3 h-3 animate-spin" /> 
                     Gerando... {progressPercent}%
                   </span>
                   <span className="text-[10px] text-gray-500">{REASONING_STEPS[reasoningStep]}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-mc-accent transition-all duration-500 ease-out"
                     style={{ width: `${progressPercent}%` }}
                   ></div>
                </div>
             </div>
          </div>
        )}
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
