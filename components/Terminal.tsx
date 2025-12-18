
import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, X, Trash2, Power, AlertTriangle, RefreshCw } from 'lucide-react';
import { bridgeService } from '../services/bridgeService';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

interface TerminalProps {
  logs: string[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
  onAddLog: (log: string) => void;
}

const Terminal: React.FC<TerminalProps> = ({ logs, isOpen, onClose, onClear, onAddLog }) => {
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setMode] = useState<'APP' | 'CMD'>('APP');
  
  // Buffer para linha de comando local (já que não temos um PTY real do outro lado)
  const cmdBufferRef = useRef<string>('');

  // Inicializa o xterm.js
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    // Se já existe, não recria
    if (xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Consolas", monospace',
      fontSize: 12,
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
      convertEol: true, // Converte \n para \r\n
      disableStdin: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalContainerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Header inicial
    term.writeln('\x1b[1;34mMineGen AI Console\x1b[0m initialized.');
    term.write('$ ');

    // Tratamento de Input Local (Line Editing Mode)
    term.onData(e => {
      // Se estiver no modo APP, ignora input (exceto talvez atalhos)
      if (mode === 'APP') return;

      // Se não estiver conectado, avisa
      if (!bridgeService.isConnected()) {
          // Apenas avisa se tentar digitar algo que não seja enter
          if (e === '\r') {
             term.writeln('\r\n\x1b[33m[AVISO] Terminal desconectado. Clique em "LOCAL CMD" para conectar.\x1b[0m');
             term.write('$ ');
          }
          return;
      }

      switch (e) {
        case '\r': // Enter
          term.write('\r\n');
          const command = cmdBufferRef.current;
          if (command.trim()) {
            bridgeService.send(command);
          }
          cmdBufferRef.current = '';
          // O prompt será desenhado quando a resposta vier ou podemos forçar
          // term.write('> '); // Deixa o backend responder
          break;
        case '\u007F': // Backspace (DEL)
          if (cmdBufferRef.current.length > 0) {
            cmdBufferRef.current = cmdBufferRef.current.slice(0, -1);
            term.write('\b \b');
          }
          break;
        case '\u0003': // Ctrl+C
            term.write('^C\r\n');
            cmdBufferRef.current = '';
            // Idealmente enviaria sinal de kill para o backend
            break;
        default:
          // Filtra caracteres imprimíveis básicos e alguns acentos
          if (e >= ' ' && e <= '~' || e.charCodeAt(0) > 127) {
            cmdBufferRef.current += e;
            term.write(e);
          }
      }
    });

    // Ajusta tamanho ao redimensionar janela
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, []); // Executa apenas na montagem inicial do componente

  // Sincroniza estado de Logs do App com o Xterm
  // Toda vez que `logs` muda, escrevemos as novas linhas no xterm
  // Precisamos rastrear o índice para não reescrever tudo
  const lastLogIndexRef = useRef(0);
  
  useEffect(() => {
    if (!xtermRef.current) return;
    
    // Se mudou para modo APP, talvez limpar e reescrever tudo? 
    // Ou apenas adicionar? Vamos apenas adicionar por enquanto.
    
    const newLogs = logs.slice(lastLogIndexRef.current);
    if (newLogs.length > 0) {
        // Se estivermos no modo CMD e chegar log do APP, talvez mostrar uma notificação?
        // Por simplificação, o xterm é um buffer único compartilhado visualmente.
        // Se quisermos separar, teríamos que limpar o buffer visualmente ao trocar de aba,
        // mas xterm não armazena buffer 'oculto' facilmente.
        
        // Estratégia: O Xterm mostra TUDO. A aba 'APP' filtra visualmente? Não.
        // Vamos usar o xterm para mostrar logs do app também.
        
        newLogs.forEach(log => {
             // Formata log do app
             xtermRef.current?.writeln(`\x1b[36m[APP]\x1b[0m ${log.replace(/\n/g, '\r\n')}`);
        });
        
        // Se não estava digitando, rola para o fim
        xtermRef.current.scrollToBottom();
        
        // Se estiver no modo APP, desenha um prompt falso
        if (mode === 'APP') {
             xtermRef.current.write('\r$ ');
        }
        
        lastLogIndexRef.current = logs.length;
    }
  }, [logs, mode]);

  // Observer para redimensionar quando a div se torna visível (isOpen)
  useEffect(() => {
    if (isOpen && fitAddonRef.current) {
        // Pequeno delay para garantir que a animação CSS terminou ou o DOM renderizou
        setTimeout(() => {
            fitAddonRef.current?.fit();
        }, 50);
    }
  }, [isOpen]);

  const toggleConnection = () => {
    if (!xtermRef.current) return;
    
    if (isConnected) {
      bridgeService.disconnect();
      setIsConnected(false);
      setMode('APP');
      xtermRef.current.writeln('\r\n\x1b[33m>>> Desconectado <<<\x1b[0m');
      xtermRef.current.write('$ ');
    } else {
      setMode('CMD');
      xtermRef.current.writeln('\r\n\x1b[32m>>> Conectando ao CMD Local... <<<\x1b[0m');
      
      bridgeService.connect(
        (data) => {
           // Output que vem do servidor
           if (xtermRef.current) {
               // O servidor envia dados brutos, xterm processa ANSI
               xtermRef.current.write(data);
           }
        },
        () => {
           setIsConnected(false);
           if (xtermRef.current) {
               xtermRef.current.write('\r\n\x1b[31m>>> Conexão Perdida <<<\x1b[0m\r\n$ ');
           }
        }
      );
      setIsConnected(true);
    }
  };

  const handleClear = () => {
      xtermRef.current?.clear();
      onClear(); // Limpa estado do react também
      lastLogIndexRef.current = 0;
      xtermRef.current?.write(mode === 'CMD' && isConnected ? '> ' : '$ ');
  };

  if (!isOpen) return null;

  return (
    <div className="h-64 bg-[#0c0c0c] border-t border-[#2b2b2b] flex flex-col font-mono text-sm z-20 shadow-[-4px_-4px_10px_rgba(0,0,0,0.5)] transition-all duration-200">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] border-b border-[#2b2b2b] select-none shrink-0">
        <div className="flex gap-4 items-center">
          <div className="flex gap-1 items-center mr-2">
             <TerminalIcon className="w-3.5 h-3.5 text-gray-400" />
             <span className="text-xs font-bold text-gray-300">TERMINAL</span>
          </div>
          
          <div className="flex bg-[#2b2b2b] rounded p-0.5">
             <button 
                onClick={() => {
                    setMode('APP');
                    xtermRef.current?.focus();
                }}
                className={`px-3 py-0.5 text-[10px] font-bold rounded-sm transition-colors ${mode === 'APP' ? 'bg-[#007acc] text-white' : 'text-gray-400 hover:text-white'}`}
             >
                LOGS
             </button>
             <button 
                onClick={() => { 
                    setMode('CMD'); 
                    if(!isConnected) toggleConnection(); 
                    xtermRef.current?.focus();
                }}
                className={`px-3 py-0.5 text-[10px] font-bold rounded-sm transition-colors flex items-center gap-1 ${mode === 'CMD' ? 'bg-[#37373d] text-white' : 'text-gray-400 hover:text-white'}`}
             >
                {isConnected ? <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> : <Power className="w-3 h-3" />}
                LOCAL SHELL
             </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {mode === 'CMD' && (
             <button 
                onClick={toggleConnection} 
                className={`p-1 rounded text-xs flex items-center gap-1 mr-2 ${isConnected ? 'text-green-400 bg-green-900/20 hover:bg-green-900/40' : 'text-gray-400 hover:text-white'}`}
                title={isConnected ? "Desconectar" : "Conectar"}
             >
                <RefreshCw className={`w-3 h-3 ${isConnected ? '' : ''}`} />
                {isConnected ? 'ON' : 'OFF'}
             </button>
          )}

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

      {/* XTerm Container */}
      <div className="flex-1 relative overflow-hidden bg-[#0c0c0c] p-1">
         <div ref={terminalContainerRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default Terminal;
