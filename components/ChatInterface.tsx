import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, PluginSettings, GeneratedProject } from '../types';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle, Trash2 } from 'lucide-react';
import { generatePluginCode } from '../services/geminiService';

interface ChatInterfaceProps {
  settings: PluginSettings;
  currentProject: GeneratedProject | null;
  onProjectGenerated: (project: any) => void;
  onClearProject: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ settings, currentProject, onProjectGenerated, onClearProject }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load chat history
  useEffect(() => {
    const savedChat = localStorage.getItem('minegen_chat_history');
    if (savedChat) {
      try {
        setMessages(JSON.parse(savedChat));
      } catch (e) {
        console.error("Failed to parse chat history");
        setDefaultMessage();
      }
    } else {
      setDefaultMessage();
    }
    setIsLoaded(true);
  }, []);

  // Save chat history
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('minegen_chat_history', JSON.stringify(messages));
    }
  }, [messages, isLoaded]);

  const setDefaultMessage = () => {
    setMessages([{
        role: 'model',
        text: `Hello! I'm MineGen AI. I can generate a ${settings.platform} plugin for Minecraft ${settings.mcVersion} (${settings.javaVersion}). Describe what you want your plugin to do!`
    }]);
  };

  const clearChat = () => {
    if (window.confirm("Start a new project? This will clear the chat and the current code.")) {
      setDefaultMessage();
      localStorage.removeItem('minegen_chat_history');
      onClearProject(); // Reset the project in App.tsx
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isLoaded]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Pass currentProject to enable iterative updates
      // If currentProject is null (start or after clear), it generates from scratch.
      const project = await generatePluginCode(userMessage.text, settings, currentProject);
      
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

  if (!isLoaded) return null;

  return (
    <div className="flex flex-col h-full bg-mc-dark relative">
       {/* Chat Header with Clear Button */}
       <div className="absolute top-2 right-4 z-10">
        <button 
          onClick={clearChat}
          className="text-gray-600 hover:text-red-400 p-2 rounded-full transition-colors bg-mc-panel/80 backdrop-blur-sm border border-gray-700"
          title="New Project (Clear History)"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24 custom-scrollbar">
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
                    {currentProject ? 'Project Updated Successfully' : 'Project Generated Successfully'}
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
                <span className="text-sm text-gray-400">
                  {currentProject ? 'Analyzing existing code and applying changes...' : 'Constructing new plugin architecture...'}
                </span>
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
            placeholder={currentProject ? "E.g., Add a config option for the message..." : "E.g., Create a plugin that gives diamonds on join..."}
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