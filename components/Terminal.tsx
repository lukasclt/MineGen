
import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Power, AlertTriangle, RefreshCw } from 'lucide-react';
import { bridgeService } from '../services/bridgeService';

interface TerminalProps {
  logs: string[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
  onAddLog: (log: string) => void;
}

const Terminal: React.FC<TerminalProps> = ({ logs, isOpen, onClose, onClear, onAddLog }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [localLogs, setLocalLogs] = useState<string[]>([]); // Logs específicos do CMD real
  const [mode, setMode] = useState<'APP' | 'CMD'>('APP'); // Alternar entre logs do App e CMD Real

  // Regex robusto para remover códigos ANSI de cor
  const stripAnsi = (str: string) => {
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  };

  // Efeito de Auto-Scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, localLogs, isOpen, mode]);

  // Focar no input ao clicar no terminal
  const handleContainerClick = () => {
    if (mode === 'CMD' && inputRef.current) {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
            inputRef.current.focus();
        }
    }
  };

  const toggleConnection = () => {
    if (isConnected) {
      bridgeService.disconnect();
      setIsConnected(false);
      setMode('APP');
    } else {
      setMode('CMD');
      bridgeService.connect(
        (data) => {
           const cleanData = stripAnsi(data);
           // Evita linhas vazias excessivas
           if (cleanData.length > 0) {
             setLocalLogs(prev => [...prev, cleanData]);
           }
        },
        () => {
           setIsConnected(false);
        }
      );
      setIsConnected(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (!command.trim()) return;
      
      if (mode === 'CMD' && isConnected) {
        bridgeService.send(command);
        // Opcional: Mostrar comando digitado localmente (echo)
        // setLocalLogs(prev => [...prev, `> ${command}\n`]);
      } else {
        onAddLog(`$ ${command}`);
        onAddLog(`Comando não reconhecido no modo APP. Use a aba "LOCAL CMD" para comandos do sistema.`);
      }
      setCommand('');
    }
  };

  if (!isOpen) return null;

  const activeLogs = mode === 'APP' ? logs : localLogs;

  return (
    <div className="h-56 bg-[#0c0c0c] border-t border-[#2b2b2b] flex flex-col font-mono text-sm z-20 shadow-[-4px_-4px_10px_rgba(0,0,0,0.5)] transition-all duration-200">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] border-b border-[#2b2b2b] select-none">
        <div className="flex gap-4 items-center">
          <div className="flex gap-1 items-center mr-2">
             <TerminalIcon className="w-3.5 h-3.5 text-gray-400" />
             <span className="text-xs font-bold text-gray-300">CONSOLE</span>
          </div>
          
          {/* Tabs / Modes */}
          <div className="flex bg-[#2b2b2b] rounded p-0.5">
             <button 
                onClick={() => setMode('APP')}
                className={`px-3 py-0.5 text-[10px] font-bold rounded-sm transition-colors ${mode === 'APP' ? 'bg-[#007acc] text-white' : 'text-gray-400 hover:text-white'}`}
             >
                MINEGEN LOGS
             </button>
             <button 
                onClick={() => { setMode('CMD'); if(!isConnected) toggleConnection(); }}
                className={`px-3 py-0.5 text-[10px] font-bold rounded-sm transition-colors flex items-center gap-1 ${mode === 'CMD' ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:text-white'}`}
             >
                {isConnected ? <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> : <Power className="w-3 h-3" />}
                LOCAL CMD
             </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {mode === 'CMD' && (
             <button 
                onClick={toggleConnection} 
                className={`p-1 rounded text-xs flex items-center gap-1 mr-2 ${isConnected ? 'text-green-400 bg-green-900/20 hover:bg-green-900/40' : 'text-gray-400 hover:text-white'}`}
                title={isConnected ? "Desconectar do PC Local" : "Conectar ao PC Local"}
             >
                <RefreshCw className={`w-3 h-3 ${isConnected ? '' : ''}`} />
                {isConnected ? 'ON' : 'OFF'}
             </button>
          )}

           <button 
            onClick={() => mode === 'APP' ? onClear() : setLocalLogs([])} 
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

      {/* Terminal Content */}
      <div 
        ref={scrollRef}
        onClick={handleContainerClick}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs custom-scrollbar bg-[#0c0c0c] text-[#cccccc] cursor-text"
      >
        {mode === 'CMD' && !isConnected && localLogs.length === 0 && (
            <div className="p-4 text-center text-gray-500">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="mb-2 font-bold text-gray-400">Terminal Local Desconectado</p>
                <p className="mb-4 max-w-md mx-auto">
                    Para usar o CMD do seu computador aqui, rode o servidor de ponte.
                </p>
                <div className="bg-[#1e1e1e] p-3 rounded text-left inline-block border border-[#333]">
                    <p className="text-[#007acc] select-all">$ node scripts/server.cjs</p>
                </div>
            </div>
        )}

        {activeLogs.map((log, index) => (
          <div key={index} className="break-words whitespace-pre-wrap leading-tight font-medium" style={{ fontFamily: 'Consolas, "Courier New", monospace' }}>
            {mode === 'APP' && <span className="text-[#007acc] mr-2">INFO:</span>}
            <span className={mode === 'CMD' ? "text-[#cccccc]" : "text-[#a0a0a0]"}>{log}</span>
          </div>
        ))}
        
        {/* Input Line */}
        <div className="flex items-center gap-1 mt-1 text-[#cccccc]">
           <span className="text-[#55FF55] select-none font-bold">{mode === 'CMD' ? (isConnected ? '>' : '#') : '$'}</span>
           <input 
             ref={inputRef}
             type="text" 
             value={command}
             onChange={(e) => setCommand(e.target.value)}
             onKeyDown={handleKeyDown}
             disabled={mode === 'CMD' && !isConnected}
             className="flex-1 bg-transparent border-none outline-none text-[#cccccc] font-mono text-xs ml-1"
             autoComplete="off"
             autoFocus={isOpen}
             placeholder={mode === 'CMD' && !isConnected ? "Conecte-se para digitar..." : ""}
           />
        </div>
      </div>
    </div>
  );
};

export default Terminal;
