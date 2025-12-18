
import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Maximize2, Minimize2, Trash2 } from 'lucide-react';

interface TerminalProps {
  logs: string[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
}

const Terminal: React.FC<TerminalProps> = ({ logs, isOpen, onClose, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="h-48 bg-[#1e1e1e] border-t border-[#2b2b2b] flex flex-col font-mono text-sm z-20 shadow-[-4px_-4px_10px_rgba(0,0,0,0.3)]">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-1 bg-[#252526] border-b border-[#2b2b2b] select-none">
        <div className="flex gap-6">
          <button className="text-white border-b border-white px-1 py-1 text-xs uppercase font-semibold">Terminal</button>
          <button className="text-gray-500 hover:text-gray-300 px-1 py-1 text-xs uppercase font-semibold transition-colors">Output</button>
          <button className="text-gray-500 hover:text-gray-300 px-1 py-1 text-xs uppercase font-semibold transition-colors">Problems</button>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={onClear} className="text-gray-400 hover:text-white p-1 rounded" title="Limpar Terminal">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded" title="Fechar Painel">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-1 custom-scrollbar bg-[#1e1e1e]"
      >
        <div className="text-gray-500 mb-2">Microsoft Windows [versão 10.0.19045.4291]<br/>(c) Microsoft Corporation. Todos os direitos reservados.<br/><br/>C:\Users\MineGen\Project&gt; minigen init</div>
        {logs.map((log, index) => (
          <div key={index} className="break-words whitespace-pre-wrap leading-5">
            <span className="text-[#55FF55] mr-2">➜</span>
            <span className="text-[#cccccc]">{log}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 mt-1">
           <span className="text-[#55FF55]">➜</span>
           <span className="w-2 h-4 bg-[#cccccc] animate-pulse"></span>
        </div>
      </div>
    </div>
  );
};

export default Terminal;
