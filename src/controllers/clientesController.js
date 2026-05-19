// controllers/clientesController.js
const { query } = require('../config/database');

/**
 * GET /clientes - Listar clientes com busca e paginação
 */
const listar = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const { busca = '', pagina = 1, limite = 20, ordenar = 'nome' } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    const ordens = {
      nome: 'c.nome ASC',
      recente: 'c.created_at DESC',
      visitas: 'c.total_visitas DESC',
      gasto: 'c.total_gasto DESC',
      aniversario: 'EXTRACT(MONTH FROM c.data_aniversario) ASC, EXTRACT(DAY FROM c.data_aniversario) ASC'
    };

    const ordenacao = ordens[ordenar] || 'c.nome ASC';

    let whereExtra = '';
    let params = [salaoId];

    if (busca) {
      params.push(`%${busca}%`);
      whereExtra = `AND (c.nome ILIKE $${params.length} OR c.telefone ILIKE $${params.length} OR c.instagram ILIKE $${params.length})`;
    }

    const [clientes, total] = await Promise.all([
      query(
        `SELECT c.*, 
                (SELECT MAX(a.data_hora_inicio) FROM agendamentos a WHERE a.cliente_id = c.id) as ultimo_agendamento,
                (SELECT s.nome FROM agendamentos a JOIN servicos s ON a.servico_id = s.id WHERE a.cliente_id = c.id ORDER BY a.data_hora_inicio DESC LIMIT 1) as ultimo_servico
         FROM clientes c
         WHERE c.salao_id = $1 AND c.ativo = true ${whereExtra}
         ORDER BY ${ordenacao}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM clientes c WHERE c.salao_id = $1 AND c.ativo = true ${whereExtra}`,
        params
      )
    ]);

    res.json({
      success: true,
      data: clientes.rows,
      paginacao: {
        total: parseInt(total.rows[0].total),
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(parseInt(total.rows[0].total) / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar clientes' });
  }
};

/**
 * GET /clientes/:id - Detalhes do cliente com histórico
 */
const detalhar = async (req, res) => {
  try {
    const { id } = req.params;
    const salaoId = req.salaoId;

    const [cliente, historico, fotos] = await Promise.all([
      query(
        'SELECT * FROM clientes WHERE id = $1 AND salao_id = $2',
        [id, salaoId]
      ),
      query(
        `SELECT a.*, s.nome as servico_nome, s.categoria, u.nome as profissional_nome,
                a.valor_cobrado, a.forma_pagamento, a.status
         FROM agendamentos a
         LEFT JOIN servicos s ON a.servico_id = s.id
         LEFT JOIN usuarios u ON a.profissional_id = u.id
         WHERE a.cliente_id = $1
         ORDER BY a.data_hora_inicio DESC
         LIMIT 20`,
        [id]
      ),
      query(
        'SELECT * FROM fotos_atendimentos WHERE cliente_id = $1 ORDER BY created_at DESC LIMIT 20',
        [id]
      )
    ]);

    if (cliente.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
    }

    res.json({
      success: true,
      data: {
        ...cliente.rows[0],
        historico: historico.rows,
        fotos: fotos.rows
      }
    });

  } catch (error) {
    console.error('Erro ao detalhar cliente:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar cliente' });
  }
};

/**
 * POST /clientes - Criar cliente
 */
const criar = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const { nome, telefone, whatsapp, instagram, email, data_aniversario, observacoes, tags } = req.body;

    const result = await query(
      `INSERT INTO clientes (salao_id, nome, telefone, whatsapp, instagram, email, data_aniversario, observacoes, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [salaoId, nome, telefone, whatsapp, instagram, email, data_aniversario || null, observacoes, tags || []]
    );

    res.status(201).json({
      success: true,
      message: 'Cliente cadastrado com sucesso!',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    res.status(500).json({ success: false, message: 'Erro ao cadastrar cliente' });
  }
};

/**
 * PUT /clientes/:id - Atualizar cliente
 */
const atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const salaoId = req.salaoId;
    const { nome, telefone, whatsapp, instagram, email, data_aniversario, observacoes, tags } = req.body;

    const result = await query(
      `UPDATE clientes SET nome = $1, telefone = $2, whatsapp = $3, instagram = $4, 
              email = $5, data_aniversario = $6, observacoes = $7, tags = $8
       WHERE id = $9 AND salao_id = $10 RETURNING *`,
      [nome, telefone, whatsapp, instagram, email, data_aniversario || null, observacoes, tags || [], id, salaoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
    }

    res.json({
      success: true,
      message: 'Cliente atualizado com sucesso!',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar cliente' });
  }
};

/**
 * DELETE /clientes/:id - Desativar cliente (soft delete)
 */
const desativar = async (req, res) => {
  try {
    const { id } = req.params;
    const salaoId = req.salaoId;

    await query(
      'UPDATE clientes SET ativo = false WHERE id = $1 AND salao_id = $2',
      [id, salaoId]
    );

    res.json({ success: true, message: 'Cliente removido com sucesso' });

  } catch (error) {
    console.error('Erro ao desativar cliente:', error);
    res.status(500).json({ success: false, message: 'Erro ao remover cliente' });
  }
};

/**
 * GET /clientes/aniversariantes - Clientes com aniversário no mês
 */
const aniversariantes = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const mes = req.query.mes || new Date().getMonth() + 1;

    const result = await query(
      `SELECT id, nome, telefone, whatsapp, data_aniversario,
              EXTRACT(DAY FROM data_aniversario) as dia
       FROM clientes
       WHERE salao_id = $1 AND ativo = true
         AND EXTRACT(MONTH FROM data_aniversario) = $2
       ORDER BY EXTRACT(DAY FROM data_aniversario) ASC`,
      [salaoId, mes]
    );

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('Erro ao buscar aniversariantes:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar aniversariantes' });
  }
};

module.exports = { listar, detalhar, criar, atualizar, desativar, aniversariantes };
