// routes/superadmin.js - Rotas do painel super admin
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const jwt = require('jsonwebtoken');

// Middleware super admin - verifica token especial
const superAdminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Token não fornecido' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.superAdmin) return res.status(403).json({ success: false, message: 'Acesso negado' });
    req.superAdmin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

// POST /api/superadmin/login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const SUPER_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'leonardorodrivr@gmail.com';
    const SUPER_SENHA = process.env.SUPER_ADMIN_SENHA || 'Vr@7151650';

    if (email !== SUPER_EMAIL || senha !== SUPER_SENHA) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { superAdmin: true, email },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ success: true, token });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erro ao fazer login' });
  }
});

// GET /api/superadmin/dashboard
router.get('/dashboard', superAdminAuth, async (req, res) => {
  try {
    const [saloes, usuarios, agendamentos, financeiro] = await Promise.all([
      query('SELECT COUNT(*) as total FROM saloes'),
      query('SELECT COUNT(*) as total FROM usuarios'),
      query('SELECT COUNT(*) as total FROM agendamentos'),
      query("SELECT COALESCE(SUM(valor),0) as total FROM financeiro WHERE tipo='entrada'"),
    ]);

    res.json({
      success: true,
      data: {
        totalSaloes: parseInt(saloes.rows[0].total),
        totalUsuarios: parseInt(usuarios.rows[0].total),
        totalAgendamentos: parseInt(agendamentos.rows[0].total),
        faturamentoTotal: parseFloat(financeiro.rows[0].total),
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/superadmin/saloes
router.get('/saloes', superAdminAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        s.*,
        COUNT(DISTINCT u.id) as total_usuarios,
        COUNT(DISTINCT c.id) as total_clientes,
        COUNT(DISTINCT a.id) as total_agendamentos,
        COALESCE(SUM(CASE WHEN f.tipo='entrada' THEN f.valor ELSE 0 END), 0) as faturamento_total
      FROM saloes s
      LEFT JOIN usuarios u ON u.salao_id = s.id
      LEFT JOIN clientes c ON c.salao_id = s.id
      LEFT JOIN agendamentos a ON a.salao_id = s.id
      LEFT JOIN financeiro f ON f.salao_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/superadmin/saloes/:id/toggle
router.put('/saloes/:id/toggle', superAdminAuth, async (req, res) => {
  try {
    const result = await query(
      'UPDATE saloes SET ativo = NOT ativo WHERE id = $1 RETURNING id, nome, ativo',
      [req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/superadmin/saloes/:id/plano
router.put('/saloes/:id/plano', superAdminAuth, async (req, res) => {
  try {
    const { plano } = req.body;
    const result = await query(
      'UPDATE saloes SET plano = $1 WHERE id = $2 RETURNING id, nome, plano',
      [plano, req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/superadmin/saloes/:id/usuarios
router.get('/saloes/:id/usuarios', superAdminAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, nome, email, cargo, ativo, ultimo_login, created_at FROM usuarios WHERE salao_id = $1',
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = { router, superAdminAuth };
