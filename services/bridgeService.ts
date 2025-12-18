
import { io, Socket } from 'socket.io-client';

class BridgeService {
  private socket: Socket | null = null;
  private url = 'http://localhost:3001';

  connect(onOutput: (data: string) => void, onDisconnect: () => void) {
    if (this.socket) return;

    this.socket = io(this.url, {
      reconnectionAttempts: 3,
      timeout: 5000
    });

    this.socket.on('connect', () => {
      onOutput('>>> Conexão estabelecida com o Terminal Local <<<\n');
    });

    this.socket.on('output', (data) => {
      onOutput(data);
    });

    this.socket.on('connect_error', () => {
      onOutput('[ERRO] Não foi possível conectar ao servidor local na porta 3001.\nCertifique-se de rodar "node scripts/server.cjs" no seu terminal.\n');
      this.disconnect();
      onDisconnect();
    });

    this.socket.on('disconnect', () => {
      onOutput('\n>>> Desconectado do Terminal Local <<<\n');
      onDisconnect();
    });
  }

  send(command: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('input', command);
    } else {
      console.warn("Socket não conectado");
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export const bridgeService = new BridgeService();
