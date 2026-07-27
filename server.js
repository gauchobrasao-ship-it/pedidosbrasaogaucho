const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { initDatabase } = require('./database/db');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const companiesRoutes = require('./routes/companies');
const productsRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const ordersRoutes = require('./routes/orders');
const quotationsRoutes = require('./routes/quotations');
const reportsRoutes = require('./routes/reports');
const comparativeRoutes = require('./routes/comparative');
const priceRequestsRoutes = require('./routes/price-requests');
const perdasRoutes = require('./routes/perdas');
const notificationsRoutes = require('./routes/notifications');
const estoqueRoutes = require('./routes/estoque');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true, index: false }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/quotations', quotationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/comparative', comparativeRoutes);
app.use('/api/price-requests', priceRequestsRoutes);
app.use('/api/perdas', perdasRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/estoque', estoqueRoutes);

// Amarra os <script src="/js/...">? a um identificador do deploy, pra forçar
// o navegador (inclusive o atalho de PWA instalado, que costuma cachear mais
// agressivo) a buscar o JS novo depois de cada deploy — sem isso, a página em
// si pode até atualizar mas os scripts antigos continuam servidos do cache.
const BUILD_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 10);
function serveVersionedHtml(filePath, res) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Erro ao carregar a página');
    const versioned = html.replace(/(<script src="\/js\/[^"]+)"/g, `$1?v=${BUILD_VERSION}"`);
    res.set('Cache-Control', 'no-cache');
    res.send(versioned);
  });
}

app.get('/cotacao/:token', (req, res) => {
  serveVersionedHtml(path.join(__dirname, 'public', 'cotacao.html'), res);
});

app.get('*', (req, res) => {
  serveVersionedHtml(path.join(__dirname, 'public', 'index.html'), res);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  async function start() {
    try {
      await initDatabase();
      app.listen(PORT, () => {
        console.log(`\n🔥 Brasão Gaúcho - Sistema de Pedidos`);
        console.log(`✅ Servidor rodando em: http://localhost:${PORT}`);
        console.log(`\n📋 Login inicial:`);
        console.log(`   Email: admin@brasao.com`);
        console.log(`   Senha: admin123\n`);
      });
    } catch (err) {
      console.error('❌ Erro ao conectar ao banco de dados:', err.message);
      process.exit(1);
    }
  }
  start();
}

module.exports = app;
