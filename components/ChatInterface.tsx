
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject, Attachment, User, GitHubRepo } from '../types';
import { Send, Bot, User as UserIcon, AlertCircle, Loader2, CheckCircle2, FileText, Paperclip, X, GitCommit, GitPullRequest } from 'lucide-react';
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
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, messages, setMessages, currentRepo, currentProject, onProjectGenerated,
  currentUser, isBuilding, onCommitTriggered
}) => {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  const handleSend = async () => {
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
     
     setIsProcessing(true);
     setStatusText("Gerando código com IA...");

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
         setIsProcessing(false);
         setStatusText("");
     }
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
         {isBuilding && (
             <div className="flex items-center gap-2 text-xs text-yellow-400 animate-pulse">
                 <Loader2 className="w-3 h-3 animate-spin" />
                 Building on GitHub Actions...
             </div>
         )}
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
         
         {isProcessing && (
             <div className="flex items-center gap-3 p-4 bg-[#252526] rounded-lg border border-[#333] w-fit">
                 <Loader2 className="w-4 h-4 text-mc-accent animate-spin" />
                 <span className="text-xs text-gray-300">{statusText}</span>
             </div>
         )}
         <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}
      <div className="p-3 bg-[#1e1e1e] border-t border-[#333]">
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
        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex gap-2">
           <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white">
               <Paperclip className="w-5 h-5" />
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
           
           <input 
             value={input} 
             onChange={e => setInput(e.target.value)} 
             className="flex-1 bg-[#252526] border border-[#333] rounded-lg px-3 text-sm text-white outline-none focus:border-mc-accent"
             placeholder={currentRepo ? "Descreva as alterações..." : "Selecione um repositório..."}
             disabled={!currentRepo || isProcessing}
           />
           <button type="submit" disabled={!input.trim() || isProcessing} className="bg-mc-accent p-2 rounded-lg text-white disabled:opacity-50">
               <Send className="w-5 h-5" />
           </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
