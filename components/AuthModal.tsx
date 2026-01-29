
import React, { useState } from 'react';
import { Github, Key, Check, ShieldAlert, ExternalLink, Loader2 } from 'lucide-react';
import { User } from '../types';
import { getAuthenticatedUser } from '../services/githubService';

interface AuthModalProps {
  isOpen: boolean;
  onAuthSuccess: (user: User) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onAuthSuccess }) => {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const githubUser = await getAuthenticatedUser(token);
      
      const user: User = {
        id: githubUser.login,
        username: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        githubToken: token
      };
      
      onAuthSuccess(user);
    } catch (err: any) {
      setError("Token inválido ou expirado. Verifique as permissões.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
      <div className="bg-[#1e1e1e] border border-gray-700 w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="p-6 bg-[#252526] border-b border-[#333]">
           <div className="flex justify-center mb-4">
               <Github className="w-12 h-12 text-white" />
           </div>
           <h2 className="text-xl font-bold text-center text-white">Login com GitHub</h2>
           <p className="text-xs text-center text-gray-400 mt-2">
             O MineGen AI precisa de acesso ao seu GitHub para criar repositórios, commitar código e verificar builds.
           </p>
        </div>

        <div className="p-6 space-y-4">
            <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded text-[11px] text-blue-200">
               <strong className="block mb-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Requisitos do Token:</strong>
               Crie um <strong>Personal Access Token (Classic)</strong> com os escopos:
               <ul className="list-disc pl-4 mt-1 text-gray-300">
                   <li><code>repo</code> (Full control of private repositories)</li>
                   <li><code>workflow</code> (Update GitHub Action workflows)</li>
               </ul>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">GitHub Personal Access Token</label>
                   <div className="relative mt-1">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input 
                        type="password" 
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxx"
                        className="w-full bg-black/30 border border-gray-600 rounded-lg py-2.5 pl-10 text-white focus:border-mc-green outline-none font-mono text-sm"
                      />
                   </div>
                </div>

                {error && <div className="text-red-400 text-xs text-center bg-red-900/20 p-2 rounded border border-red-500/30">{error}</div>}

                <button 
                  type="submit" 
                  disabled={isLoading || !token}
                  className="w-full bg-mc-green hover:bg-green-600 text-black font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                   {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                   {isLoading ? 'Verificando...' : 'Conectar GitHub'}
                </button>
            </form>

            <a 
              href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=MineGen+AI+Access" 
              target="_blank" 
              rel="noreferrer"
              className="block text-center text-xs text-gray-500 hover:text-white underline flex items-center justify-center gap-1"
            >
               Gerar Token Rapidamente <ExternalLink className="w-3 h-3" />
            </a>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
