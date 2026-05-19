require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ name: 'Beleza SaaS API', version: '1.0.0', status: 'online' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Rota não encontrada: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   💅 Beleza SaaS API - Rodando!        ║
╠════════════════════════════════════════╣
║  🌐 URL: http://localhost:${PORT}         ║
║  🌍 Ambiente: ${(process.env.NODE_ENV || 'development').padEnd(26)}║
║  📊 API: http://localhost:${PORT}/api     ║
╚════════════════════════════════════════╝
  `);
});

module.exports = app;
