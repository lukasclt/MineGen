import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/MineGen/', // Importante: Isso deve corresponder ao nome do seu repositório no GitHub
  define: {
    // Polyfill simples para evitar erros de 'process is not defined' no navegador,
    // já que removemos a dependência direta do Node.js
    'process.env': {}
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});