// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_fallback_change_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Gera tokens JWT
 */
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
};

/**
 * POST /auth/register - Cadastrar novo salão + admin
 */
const register = async (req, res) => {
  try {
    const { nomeUsuario, email, senha, nomeSalao, telefone } = req.body;

    // Verificar email duplicado
    const emailExistente = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (emailExistente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Este e-mail já está cadastrado'
      });
    }

    const senhaHash = await bcrypt.hash(senha, 12);

    const result = await transaction(async (client) => {
      // Criar salão
      const salaoResult = await client.query(
        `INSERT INTO saloes (nome, email, telefone) VALUES ($1, $2, $3) RETURNING *`,
        [nomeSalao, email, telefone]
      );
      const salao = salaoResult.rows[0];

      // Criar usuário admin
      const usuarioResult = await client.query(
        `INSERT INTO usuarios (salao_id, nome, email, senha_hash, cargo) 
         VALUES ($1, $2, $3, $4, 'admin') RETURNING id, nome, email, cargo`,
        [salao.id, nomeUsuario, email, senhaHash]
      );
      const usuario = usuarioResult.rows[0];

      return { salao, usuario };
    });

    const { accessToken, refreshToken } = generateTokens(result.usuario.id);

    // Salvar refresh token
    await query('UPDATE usuarios SET refresh_token = $1 WHERE id = $2', [refreshToken, result.usuario.id]);

    res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso!',
      data: {
        usuario: result.usuario,
        salao: { id: result.salao.id, nome: result.salao.nome },
        token: accessToken
      }
    });

  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar conta' });
  }
};

/**
 * POST /auth/login
 */
const login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    const result = await query(
      `SELECT u.*, s.nome as salao_nome, s.plano as salao_plano, s.ativo as salao_ativo
       FROM usuarios u
       JOIN saloes s ON u.salao_id = s.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'E-mail ou senha incorretos'
      });
    }

    const usuario = result.rows[0];

    if (!usuario.ativo) {
      return res.status(401).json({ success: false, message: 'Usuário inativo' });
    }

    if (!usuario.salao_ativo) {
      return res.status(403).json({ success: false, message: 'Salão inativo' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({
        success: false,
        message: 'E-mail ou senha incorretos'
      });
    }

    const { accessToken, refreshToken } = generateTokens(usuario.id);

    // Atualizar último login e refresh token
    await query(
      'UPDATE usuarios SET ultimo_login = NOW(), refresh_token = $1 WHERE id = $2',
      [refreshToken, usuario.id]
    );

    const { senha_hash, refresh_token, ...usuarioLimpo } = usuario;

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        usuario: usuarioLimpo,
        token: accessToken
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, message: 'Erro ao fazer login' });
  }
};

/**
 * GET /auth/me - Perfil do usuário logado
 */
const me = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.whatsapp, u.instagram, 
              u.foto_url, u.cargo, u.especialidades, u.comissao_percentual, 
              u.meta_mensal, u.ultimo_login, u.created_at,
              s.id as salao_id, s.nome as salao_nome, s.plano as salao_plano,
              s.telefone as salao_telefone, s.logo_url as salao_logo
       FROM usuarios u
       JOIN saloes s ON u.salao_id = s.id
       WHERE u.id = $1`,
      [req.usuario.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar perfil' });
  }
};

/**
 * PUT /auth/profile - Atualizar perfil
 */
const updateProfile = async (req, res) => {
  try {
    const { nome, telefone, whatsapp, instagram, meta_mensal } = req.body;

    const result = await query(
      `UPDATE usuarios SET nome = $1, telefone = $2, whatsapp = $3, instagram = $4, meta_mensal = $5
       WHERE id = $6 RETURNING id, nome, email, telefone, whatsapp, instagram, meta_mensal, cargo`,
      [nome, telefone, whatsapp, instagram, meta_mensal, req.usuario.id]
    );

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar perfil' });
  }
};

/**
 * POST /auth/change-password
 */
const changePassword = async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    const result = await query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
    const usuario = result.rows[0];

    const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(400).json({ success: false, message: 'Senha atual incorreta' });
    }

    const novaSenhaHash = await bcrypt.hash(novaSenha, 12);
    await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novaSenhaHash, req.usuario.id]);

    res.json({ success: true, message: 'Senha alterada com sucesso' });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ success: false, message: 'Erro ao alterar senha' });
  }
};

module.exports = { register, login, me, updateProfile, changePassword };
