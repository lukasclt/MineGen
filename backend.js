
const app = require('./api/index.js');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 MineGen Backend rodando em http://localhost:${PORT}`);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    console.log("✅ Conectado ao Vercel Blob Storage");
  } else {
    console.warn("⚠️  BLOB_READ_WRITE_TOKEN não encontrado. Rodando em modo Memória Volátil.");
    console.warn("   (Dados serão perdidos ao reiniciar o servidor)");
  }
});
