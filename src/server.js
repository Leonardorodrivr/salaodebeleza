// src/server.js - Servidor principal
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARES DE SEGURANÇA
// ============================================================
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  message: { success: false, message: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use('/api/', limiter);

// Rate limit mais restrito para auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Muitas tentativas de login.' }
});
app.use('/api/auth/login', authLimiter);

// ============================================================
// CORS
// ============================================================
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ============================================================
// PARSERS
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// LOGS
// ============================================================
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ============================================================
// ARQUIVOS ESTÁTICOS (uploads)
// ============================================================
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ============================================================
// ROTAS DA API
// ============================================================
app.use('/api', routes);

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    name: 'Beleza SaaS API',
    version: '1.0.0',
    status: 'online',
    docs: '/api/health'
  });
});

// ============================================================
// ERRO 404
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Rota não encontrada: ${req.method} ${req.path}`
  });
});

// ============================================================
// HANDLER DE ERROS GLOBAL
// ============================================================
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'JSON inválido' });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message
  });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
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
