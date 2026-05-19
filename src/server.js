require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// Necessário para Railway/Heroku
app.set('trust proxy', 1);

// Segurança básica
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));

// CORS liberado para o Netlify
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Rotas
app.use('/api', routes);

app.get('/', (req, res) => {
  res.json({ name: 'GlamFlow API', version: '1.0.0', status: 'online' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Rota nao encontrada: ${req.method} ${req.path}` });
});

// Erro global
app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`GlamFlow API rodando na porta ${PORT}`);
});

module.exports = app;
