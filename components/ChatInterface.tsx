import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings } from '../types';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  onProjectGenerated: (project: any) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ settings, onProjectGenerated }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
        role: 'model',
        text: `Hello! I'm MineGen AI. I can generate a ${settings.platform} plugin for Minecraft ${settings.mcVersion} (${settings.javaVersion}). describe what you want your plugin to do!`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const project = await generatePluginCode(userMessage.text, settings);
      
      const aiMessage: ChatMessage = {
        role: 'model',
        text: project.explanation,
        projectData: project
      };
      
      setMessages(prev => [...prev, aiMessage]);
      onProjectGenerated(project);
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'model',
        text: error.message || "An error occurred while generating the plugin.",
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-mc-dark relative">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-mc-panel flex items-center justify-center flex-shrink-0 border border-gray-700">
                {msg.isError ? <AlertCircle className="w-5 h-5 text-red-500" /> : <Bot className="w-5 h-5 text-mc-accent" />}
              </div>
            )}
            
            <div className={`max-w-[85%] rounded-2xl px-5 py-3 shadow-sm ${
              msg.role === 'user' 
                ? 'bg-mc-accent text-white rounded-br-none' 
                : msg.isError 
                  ? 'bg-red-900/30 border border-red-500/50 text-red-200 rounded-bl-none'
                  : 'bg-mc-panel border border-gray-700 text-gray-200 rounded-bl-none'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              {msg.projectData && (
                <div className="mt-3 pt-3 border-t border-gray-600/50">
                  <div className="flex items-center gap-2 text-xs text-mc-green font-medium">
                    <Sparkles className="w-3 h-3" />
                    Plugin Generated Successfully
                  </div>
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-gray-300" />
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded-full bg-mc-panel flex items-center justify-center flex-shrink-0 border border-gray-700">
                <Loader2 className="w-5 h-5 text-mc-accent animate-spin" />
            </div>
            <div className="bg-mc-panel border border-gray-700 rounded-2xl rounded-bl-none px-5 py-3 flex items-center gap-2">
                <span className="text-sm text-gray-400">Constructing plugin architecture...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-mc-dark via-mc-dark to-transparent pt-10">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="E.g., Create a plugin that gives players a diamond when they join..."
            className="w-full bg-[#2B2D31] text-white border border-gray-600 rounded-xl pl-4 pr-12 py-4 shadow-lg focus:outline-none focus:border-mc-accent focus:ring-1 focus:ring-mc-accent placeholder-gray-500 transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 bottom-2 bg-mc-accent hover:bg-blue-600 text-white rounded-lg px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
        <p className="text-center text-[10px] text-gray-500 mt-2">
          AI can make mistakes. Always review the generated code before deploying to a production server.
        </p>
      </div>
    </div>
  );
};

export default ChatInterface;