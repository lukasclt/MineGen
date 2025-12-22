
import app from './api/index.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 MineGen Backend rodando em http://localhost:${PORT}`);
  if (process.env.REDIS_URL) {
    console.log("✅ Conectado ao Redis");
  } else {
    console.warn("⚠️  REDIS_URL não encontrado.");
    console.warn("   Rodando em modo Memória (dados perdidos ao reiniciar).");
  }
});
