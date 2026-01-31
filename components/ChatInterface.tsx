
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User, GitHubRepo, UsageStats } from '../types';
import { Send, Bot, User as UserIcon, AlertCircle, Loader2, CheckCircle2, FileText, Paperclip, X, GitCommit, GitPullRequest, Hammer } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';
import { commitToRepo } from '../services/githubService'; // Serviço GitHub
import { playSound } from '../services/audioService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  currentRepo: GitHubRepo | null;
  currentProject: GeneratedProject | null; // Contexto atual do código
  onProjectGenerated: (project: any) => void; // Callback para atualizar estado local
  currentUser: User | null;
  // Controle de Build
  isBuilding: boolean;
  onCommitTriggered: () => void;
  // Estado de Geração da IA (Lifting State Up)
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;
  // Uso
  usageStats?: UsageStats;
  incrementUsage?: () => void;
  repoLoading?: boolean; // Novo prop para estado de loading do repo
  onManualBuild: () => void; // Novo prop para build manual
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, messages, setMessages, currentRepo, currentProject, onProjectGenerated,
  currentUser, isBuilding, onCommitTriggered,
  isGenerating, setIsGenerating,
  usageStats, incrementUsage, repoLoading,
  onManualBuild
}) => {
  const [input, setInput] = useState('');
  const [statusText, setStatusText] = useState('');
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Estado unificado de "Ocupado"
  const isBusy = isGenerating || isBuilding || repoLoading;

  const isQuotaExceeded = usageStats ? usageStats.used >= usageStats.limit : false;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  const handleSend = async () => {
     // Bloqueio de segurança
     if (isBusy) return;
     if (isQuotaExceeded) return;

     if (!input.trim() && attachments.length === 0) return;
     if (!currentRepo || !currentUser) {
         alert("Selecione um repositório primeiro.");
         return;
     }

     const userMsg: ChatMessage = {
         id: Date.now().toString(),
         role: 'user',
         text: input,
         attachments: [...attachments],
         senderName: currentUser.username
     };
     setMessages(prev => [...prev, userMsg]);
     setInput('');
     setAttachments([]);
     
     setIsGenerating(true);
     setStatusText("Gerando código com IA (Isso pode levar um minuto)...");

     try {
         // 1. Gera código (JSON)
         const generated = await generatePluginCode(userMsg.text, settings, currentProject, userMsg.attachments, currentUser);
         
         setStatusText("Commitando alterações no GitHub...");
         
         // 2. Commit no GitHub
         await commitToRepo(
             currentUser.githubToken,
             currentRepo.owner.login,
             currentRepo.name,
             generated.files,
             generated.commitTitle || "AI Update",
             generated.commitDescription || "Automated changes by MineGen AI"
         );

         // 3. Atualiza UI e Dispara Build Loop
         onProjectGenerated(generated);
         onCommitTriggered(); // Avisa App para começar a monitorar o Build
         incrementUsage && incrementUsage(); // Incrementa uso
         
         const aiMsg: ChatMessage = {
             id: Date.now().toString() + '_ai',
             role: 'model',
             text: generated.explanation,
             projectData: generated
         };
         setMessages(prev => [...prev, aiMsg]);
         playSound('success');

     } catch (e: any) {
         setMessages(prev => [...prev, {
             id: Date.now().toString() + '_err',
             role: 'model',
             text: `Erro: ${e.message}`,
             isError: true
         }]);
         playSound('error');
     } finally {
         setIsGenerating(false);
         setStatusText("");
     }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Shift + Enter OR Shift + Space (as requested) adds a new line
      if ((e.key === 'Enter' || e.key === ' ') && e.shiftKey) {
          e.preventDefault();
          const target = e.target as HTMLTextAreaElement;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          
          // Insere quebra de linha
          const newValue = input.substring(0, start) + "\n" + input.substring(end);
          setInput(newValue);
          
          // Corrige posição do cursor após renderização
          setTimeout(() => {
              if (textAreaRef.current) {
                textAreaRef.current.selectionStart = textAreaRef.current.selectionEnd = start + 1;
              }
          }, 0);
          return;
      }

      // Enter normal sends
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  };

  // Helper para placeholder dinâmico
  const getPlaceholder = () => {
      if (isQuotaExceeded) return `Cota excedida. Reseta em ${usageStats?.resetDate}`;
      if (repoLoading) return "Carregando repositório...";
      if (!currentRepo) return "Selecione um repositório...";
      if (isBuilding) return "Aguarde o build finalizar...";
      if (isGenerating) return "A IA está gerando código...";
      return "Descreva as alterações... (Shift+Space para nova linha)";
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] relative min-w-0">
      
      {/* HEADER */}
      <div className="bg-[#252526] border-b border-[#333] px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
         <div className="flex items-center gap-2">
             <Bot className="w-4 h-4 text-mc-accent" />
             <span className="text-sm font-bold text-gray-200">
                {currentRepo ? currentRepo.name : 'Selecione um Repo'}
             </span>
         </div>
         
         <div className="flex items-center gap-2">
             <button 
                onClick={onManualBuild}
                disabled={isBusy || !currentRepo} 
                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-200 text-xs rounded border border-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Disparar Build Manualmente"
             >
                <Hammer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Build</span>
             </button>

             {isBuilding && (
                 <div className="flex items-center gap-2 text-xs text-yellow-400 animate-pulse ml-2">
                     <Loader2 className="w-3 h-3 animate-spin" />
                     <span className="hidden sm:inline">Building...</span>
                 </div>
             )}
         </div>
      </div>

      {/* MENSAGENS */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
         {messages.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-gray-600">
                 <Bot className="w-12 h-12 mb-2 opacity-20" />
                 <p className="text-sm">Inicie uma conversa para gerar código.</p>
                 <p className="text-xs">As alterações serão commitadas diretamente na branch main.</p>
             </div>
         )}
         
         {messages.map((msg, i) => (
             <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                 <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${msg.role === 'model' ? 'bg-mc-accent' : 'bg-gray-700'}`}>
                    {msg.role === 'model' ? <Bot className="w-5 h-5 text-white" /> : <UserIcon className="w-4 h-4 text-white" />}
                 </div>
                 <div className={`max-w-[85%] rounded-lg p-3 text-sm ${msg.role === 'user' ? 'bg-[#264f78] text-white' : 'bg-[#252526] text-gray-300 border border-[#333]'}`}>
                     <div className="whitespace-pre-wrap">{msg.text}</div>
                     {msg.projectData && (
                         <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-[10px] text-green-400">
                             <GitCommit className="w-3 h-3" />
                             <span>Commit: {msg.projectData.commitTitle}</span>
                         </div>
                     )}
                 </div>
             </div>
         ))}
         
         {isGenerating && (
             <div className="flex items-center gap-3 p-4 bg-[#252526] rounded-lg border border-[#333] w-fit">
                 <Loader2 className="w-4 h-4 text-mc-accent animate-spin" />
                 <span className="text-xs text-gray-300">{statusText}</span>
             </div>
         )}
         <div ref={messagesEndRef} />
      </div>

      {/* BLOQUEIO DE COTA */}
      {isQuotaExceeded && (
        <div className="px-3 pb-3 bg-[#1e1e1e]">
            <div className="p-3 bg-[#2d2020] border border-red-900/50 rounded-lg flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-2 text-xs text-red-300">
                    <AlertCircle className="w-4 h-4" />
                    <div className="flex flex-col">
                        <span className="font-bold">Cota de mensagens excedida.</span>
                        <span className="text-[10px] opacity-70">Reseta em {usageStats?.resetDate}</span>
                    </div>
                </div>
                <button 
                  onClick={() => alert("Você será avisado quando a cota resetar!")}
                  className="text-[10px] bg-red-900/50 hover:bg-red-800 text-white px-3 py-1.5 rounded border border-red-700 transition-colors"
                >
                    Avise-me
                </button>
            </div>
        </div>
      )}

      {/* INPUT */}
      <div className={`p-3 bg-[#1e1e1e] border-t border-[#333] ${isQuotaExceeded ? 'opacity-50 pointer-events-none' : ''}`}>
        {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto">
                {attachments.map((a, i) => (
                    <div key={i} className="bg-[#333] px-2 py-1 rounded text-xs flex items-center gap-2">
                        <FileText className="w-3 h-3" /> {a.name} 
                        <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}><X className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>
        )}
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2 items-end">
           <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 mb-1 text-gray-400 hover:text-white" disabled={isBusy || isQuotaExceeded}>
               <Paperclip className={`w-5 h-5 ${isBusy ? 'opacity-50' : ''}`} />
           </button>
           <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => {
               if (e.target.files) {
                   Array.from(e.target.files).forEach((f: File) => {
                       const r = new FileReader();
                       r.onload = () => setAttachments(prev => [...prev, { type: 'text', name: f.name, content: r.result as string }]);
                       r.readAsText(f);
                   });
               }
           }} />
           
           <textarea
             ref={textAreaRef}
             value={input} 
             onChange={e => setInput(e.target.value)}
             onKeyDown={handleKeyDown}
             className={`flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-mc-accent resize-none min-h-[40px] max-h-[120px] custom-scrollbar ${isBusy ? 'opacity-50 cursor-not-allowed' : ''}`}
             placeholder={getPlaceholder()}
             disabled={!currentRepo || isBusy || isQuotaExceeded}
             rows={1}
           />
           <button 
             type="submit" 
             disabled={(!input.trim() && attachments.length === 0) || isBusy || isQuotaExceeded} 
             className="bg-mc-accent p-2 mb-1 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
           >
               {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
           </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
