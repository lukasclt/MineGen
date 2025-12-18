
import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, X, Trash2 } from 'lucide-react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
  logs: string[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
  onAddLog: (log: string) => void;
}

const Terminal: React.FC<TerminalProps> = ({ logs, isOpen, onClose, onClear }) => {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLogIndexRef = useRef(0);

  // Inicializa o xterm.js
  useEffect(() => {
    if (!terminalContainerRef.current) return;
    if (xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: false, // Desativado pois é apenas leitura
      fontFamily: '"JetBrains Mono", "Consolas", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      disableStdin: true, // Terminal somente leitura
      theme: {
        background: '#0c0c0c',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[1;34mMineGen AI Console\x1b[0m initialized.');
    term.writeln('Waiting for logs...');

    // Ajusta tamanho ao redimensionar janela
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  // Sincroniza logs
  useEffect(() => {
    if (!xtermRef.current) return;
    
    const newLogs = logs.slice(lastLogIndexRef.current);
    if (newLogs.length > 0) {
        newLogs.forEach(log => {
             // Formatação simples para destacar prefixos comuns
             let formattedLog = log;
             if (log.startsWith('Sistema:')) {
               formattedLog = `\x1b[36m[SYS]\x1b[0m ${log.substring(8)}`;
             } else if (log.startsWith('Erro:')) {
               formattedLog = `\x1b[31m[ERR]\x1b[0m ${log.substring(5)}`;
             } else if (log.startsWith('AI:')) {
               formattedLog = `\x1b[35m[AI]\x1b[0m ${log.substring(3)}`;
             } else {
               formattedLog = `\x1b[32m[LOG]\x1b[0m ${log}`;
             }

             xtermRef.current?.writeln(formattedLog.replace(/\n/g, '\r\n'));
        });
        
        xtermRef.current.scrollToBottom();
        lastLogIndexRef.current = logs.length;
    }
  }, [logs]);

  // Ajusta fit quando o painel abre
  useEffect(() => {
    if (isOpen && fitAddonRef.current) {
        setTimeout(() => {
            fitAddonRef.current?.fit();
        }, 50);
    }
  }, [isOpen]);

  const handleClear = () => {
      xtermRef.current?.clear();
      onClear();
      lastLogIndexRef.current = 0;
  };

  if (!isOpen) return null;

  return (
    <div className="h-48 bg-[#0c0c0c] border-t border-[#2b2b2b] flex flex-col font-mono text-sm z-20 shadow-[-4px_-4px_10px_rgba(0,0,0,0.5)] transition-all duration-200">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] border-b border-[#2b2b2b] select-none shrink-0">
        <div className="flex gap-4 items-center">
          <div className="flex gap-1 items-center">
             <TerminalIcon className="w-3.5 h-3.5 text-gray-400" />
             <span className="text-xs font-bold text-gray-300">OUTPUT</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
           <button 
            onClick={handleClear} 
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#333]" 
            title="Limpar Terminal"
           >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#333]" 
            title="Fechar Painel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#0c0c0c] p-1">
         <div ref={terminalContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default Terminal;
