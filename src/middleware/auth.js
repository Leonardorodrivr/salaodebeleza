// middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Middleware de autenticação JWT
 * Valida o token e injeta o usuário na requisição
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token de autenticação não fornecido'
      });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
    
    // Buscar usuário atual no banco
    const result = await query(
      `SELECT u.*, s.plano as salao_plano, s.ativo as salao_ativo
       FROM usuarios u
       JOIN saloes s ON u.salao_id = s.id
       WHERE u.id = $1 AND u.ativo = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado ou inativo'
      });
    }

    const usuario = result.rows[0];
    
    if (!usuario.salao_ativo) {
      return res.status(403).json({
        success: false,
        message: 'Salão inativo. Entre em contato com o suporte.'
      });
    }

    // Remover senha do objeto do usuário
    delete usuario.senha_hash;
    delete usuario.refresh_token;
    
    req.usuario = usuario;
    req.salaoId = usuario.salao_id;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirado. Faça login novamente.'
      });
    }
    
    console.error('Erro na autenticação:', error);
    return res.status(500).json({
      success: false,
      message: 'Erro interno na autenticação'
    });
  }
};

/**
 * Middleware de autorização por cargo
 */
const authorize = (...cargosPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: 'Não autenticado'
      });
    }
    
    if (!cargosPermitidos.includes(req.usuario.cargo)) {
      return res.status(403).json({
        success: false,
        message: 'Você não tem permissão para esta ação'
      });
    }
    
    next();
  };
};

module.exports = { authenticate, authorize };
