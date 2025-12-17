import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject } from '../types';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, Trash2, Cpu } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  messages: ChatMessage[];
  setMessages: (msgs: ChatMessage[]) => void;
  currentProject: GeneratedProject | null;
  onProjectGenerated: (project: any) => void;
  onClearProject: () => void;
  onUpdateProjectName: (name: string) => void;
  isExternalLoading?: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  settings, 
  messages, 
  setMessages, 
  currentProject, 
  onProjectGenerated, 
  onClearProject,
  onUpdateProjectName,
  isExternalLoading = false
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isExternalLoading, progress]);

  // Handle first user message to name the project automatically
  useEffect(() => {
    if (messages.length === 2 && messages[1].role === 'user') {
      const firstUserMsg = messages[1].text;
      const suggestedName = firstUserMsg.split(' ').slice(0, 4).join(' ').substring(0, 25);
      if (suggestedName) onUpdateProjectName(suggestedName);
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isExternalLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages([...messages, userMessage]);
    setInput('');
    setIsLoading(true);
    setProgress(0);
    setLoadingText(currentProject ? 'Analisando alterações...' : 'Arquitetando plugin...');

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return 90;
        return prev + Math.max(1, (90 - prev) / 10);
      });
    }, 400);

    try {
      const project = await generatePluginCode(userMessage.text, settings, currentProject);
      clearInterval(progressInterval);
      setProgress(100);
      setLoadingText('Gerando arquivos...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const aiMessage: ChatMessage = {
        role: 'model',
        text: project.explanation,
        projectData: project
      };
      
      setMessages([...messages, userMessage, aiMessage]);
      onProjectGenerated(project);
    } catch (error: any) {
      clearInterval(progressInterval);
      const errorMessage: ChatMessage = {
        role: 'model',
        text: error.message || "Ocorreu um erro ao gerar o plugin.",
        isError: true
      };
      setMessages([...messages, userMessage, errorMessage]);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  const handleClear = () => {
    if (confirm("Limpar conversa deste projeto?")) {
        const defaultMsg: ChatMessage = { 
            role: 'model', 
            text: `Histórico limpo. Como posso ajudar com o plugin ${settings.name}?` 
        };
        setMessages([defaultMsg]);
    }
  };

  const effectiveLoading = isLoading || isExternalLoading;

  return (
    <div className="flex flex-col h-full relative z-10">
       <div className="absolute top-2 right-4 z-10 flex gap-2">
        <button onClick={handleClear} className="text-gray-400 hover:text-red-400 p-2 rounded-full transition-colors bg-mc-panel/80 backdrop-blur-sm border border-gray-700"><Trash2 className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-mc-panel flex items-center justify-center flex-shrink-0 border border-gray-700 mt-1 shadow-lg">
                {msg.isError ? <AlertCircle className="w-5 h-5 text-red-500" /> : <Bot className="w-5 h-5 text-mc-accent" />}
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-lg backdrop-blur-sm ${msg.role === 'user' ? 'bg-mc-accent text-white rounded-br-none' : msg.isError ? 'bg-red-900/30 border border-red-500/50 text-red-200 rounded-bl-none' : 'bg-mc-panel/90 border border-gray-700 text-gray-200 rounded-bl-none'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              {msg.projectData && (
                <div className="mt-3 pt-3 border-t border-gray-600/50 flex items-center gap-2 text-xs text-mc-green font-medium">
                  <Sparkles className="w-3 h-3" /> Alterações Aplicadas
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 mt-1 shadow-lg"><User className="w-5 h-5 text-gray-300" /></div>
            )}
          </div>
        ))}
        {effectiveLoading && (
          <div className="flex flex-col gap-2 max-w-[85%]">
            <div className="flex gap-4 items-end">
               <div className="w-8 h-8 rounded-full bg-mc-panel flex items-center justify-center border border-gray-700 shadow-lg"><Cpu className="w-5 h-5 text-mc-accent animate-pulse" /></div>
               <div className="bg-mc-panel/90 border border-gray-700 rounded-2xl rounded-bl-none px-4 py-3 flex flex-col gap-2 min-w-[250px]">
                  <div className="flex justify-between items-center text-xs text-gray-400 font-mono">
                    <span>{isLoading ? loadingText : 'IA Corrigindo Build...'}</span>
                    <span className="text-mc-accent">{isLoading ? Math.round(progress) + '%' : ''}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full bg-mc-accent transition-all duration-300 ${isExternalLoading ? 'animate-pulse w-full' : ''}`} style={isLoading ? { width: `${progress}%` } : {}} />
                  </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 bg-gradient-to-t from-mc-dark via-mc-dark to-transparent">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={currentProject ? "Ex: Adicione um comando /spawn..." : "Crie um plugin..."} className="w-full bg-[#2B2D31]/90 backdrop-blur-md text-white border border-gray-600 rounded-xl pl-4 pr-12 py-4 shadow-2xl focus:outline-none focus:border-mc-accent text-sm" disabled={effectiveLoading} />
          <button type="submit" disabled={!input.trim() || effectiveLoading} className="absolute right-2 top-2 bottom-2 bg-mc-accent hover:bg-blue-600 text-white rounded-lg px-3 transition-colors disabled:opacity-50"><Send className="w-5 h-5" /></button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;