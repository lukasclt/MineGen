
import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User as UserIcon, LogIn, UserPlus, ShieldCheck, Key, Eye, EyeOff, Loader2 } from 'lucide-react';
import { User } from '../types';
import { dbService } from '../services/dbService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
  initialUser?: User | null;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess, initialUser }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'profile'>(initialUser ? 'profile' : 'login');
  const [email, setEmail] = useState(initialUser?.email || '');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState(initialUser?.username || '');
  const [apiKey, setApiKey] = useState(initialUser?.savedApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (initialUser) {
      setMode('profile');
      setEmail(initialUser.email);
      setUsername(initialUser.username);
      setApiKey(initialUser.savedApiKey || '');
    } else {
      setMode('login');
      setPassword('');
      setError('');
    }
  }, [initialUser, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        if (!email || !password) throw new Error('E-mail e senha são obrigatórios.');
        
        const user = await dbService.loginUser(email, password);
        onAuthSuccess(user);
        onClose();

      } else if (mode === 'register') {
        if (!email || !password || !username) throw new Error('Todos os campos são obrigatórios.');
        
        const newUser: Partial<User> = { username, email, savedApiKey: apiKey };
        const user = await dbService.registerUser(newUser, password);
        onAuthSuccess(user);
        onClose();

      } else if (mode === 'profile') {
        if (!initialUser) return;
        
        const updatedUser: User = { 
          ...initialUser, 
          username, 
          savedApiKey: apiKey 
        };
        // Aqui usamos updateUser em vez de register/login
        const finalUser = await dbService.updateUser(updatedUser);
        onAuthSuccess(finalUser);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Ocorreu um erro. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-mc-panel border border-gray-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              {mode === 'login' ? <LogIn className="text-mc-accent" /> : 
               mode === 'register' ? <UserPlus className="text-mc-green" /> : 
               <UserIcon className="text-mc-gold" />}
              {mode === 'login' ? 'Acessar Conta' : 
               mode === 'register' ? 'Criar Nova Conta' : 
               'Perfil do Desenvolvedor'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(mode === 'register' || mode === 'profile') && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nome de Usuário</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-mc-accent outline-none"
                    placeholder="Seu nome"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  disabled={mode === 'profile'}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-mc-accent outline-none disabled:opacity-50"
                  placeholder="exemplo@email.com"
                />
              </div>
            </div>

            {mode !== 'profile' && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-mc-accent outline-none"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-gray-800">
              <label className="block text-xs font-bold text-mc-gold uppercase mb-1 flex items-center gap-1.5">
                <Key className="w-3 h-3" /> OpenRouter API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg py-2.5 pl-4 pr-10 text-white font-mono text-xs focus:border-mc-gold outline-none"
                  placeholder="sk-or-v1-..."
                />
                <button 
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[9px] text-gray-500 mt-1 italic">Sua chave é salva apenas neste navegador (ou no banco se logado).</p>
            </div>

            {error && (
              <div className="text-red-400 text-xs py-2 px-3 bg-red-900/20 border border-red-500/30 rounded flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'login' ? 'bg-mc-accent hover:bg-blue-600' : mode === 'register' ? 'bg-mc-green hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {isLoading ? (
                <>
                   <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                </>
              ) : (
                 mode === 'login' ? 'Entrar' : mode === 'register' ? 'Registrar Agora' : 'Salvar Alterações'
              )}
            </button>
          </form>

          {mode !== 'profile' && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                   setMode(mode === 'login' ? 'register' : 'login');
                   setError('');
                }}
                className="text-sm text-gray-400 hover:text-mc-accent transition-colors underline"
              >
                {mode === 'login' ? 'Não tem uma conta? Registre-se' : 'Já possui conta? Faça login'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-black/20 p-4 text-[10px] text-gray-500 flex items-center justify-center gap-2 border-t border-gray-700">
          <ShieldCheck className="w-3 h-3" /> MineGen AI utiliza Redis para autenticação.
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
