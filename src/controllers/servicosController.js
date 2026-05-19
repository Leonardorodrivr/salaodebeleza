// controllers/servicosController.js
const { query } = require('../config/database');

const listar = async (req, res) => {
  try {
    const { categoria } = req.query;
    let params = [req.salaoId];
    let whereExtra = '';

    if (categoria) {
      params.push(categoria);
      whereExtra = `AND categoria = $${params.length}`;
    }

    const result = await query(
      `SELECT s.*,
              COUNT(a.id) as total_agendamentos,
              COALESCE(SUM(a.valor_cobrado), 0) as total_faturado
       FROM servicos s
       LEFT JOIN agendamentos a ON a.servico_id = s.id AND a.status = 'finalizado'
       WHERE s.salao_id = $1 AND s.ativo = true ${whereExtra}
       GROUP BY s.id
       ORDER BY s.categoria, s.nome`,
      params
    );

    // Buscar categorias únicas
    const categorias = await query(
      'SELECT DISTINCT categoria FROM servicos WHERE salao_id = $1 AND ativo = true ORDER BY categoria',
      [req.salaoId]
    );

    res.json({
      success: true,
      data: result.rows,
      categorias: categorias.rows.map(r => r.categoria)
    });
  } catch (error) {
    console.error('Erro ao listar serviços:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar serviços' });
  }
};

const criar = async (req, res) => {
  try {
    const { nome, descricao, categoria, valor, duracao_minutos, comissao_percentual, cor_agenda } = req.body;

    const result = await query(
      `INSERT INTO servicos (salao_id, nome, descricao, categoria, valor, duracao_minutos, comissao_percentual, cor_agenda)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.salaoId, nome, descricao, categoria, valor, duracao_minutos, comissao_percentual || 0, cor_agenda || '#D4A5BF']
    );

    res.status(201).json({ success: true, message: 'Serviço criado!', data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar serviço:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar serviço' });
  }
};

const atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, descricao, categoria, valor, duracao_minutos, comissao_percentual, cor_agenda, ativo } = req.body;

    const result = await query(
      `UPDATE servicos SET nome=$1, descricao=$2, categoria=$3, valor=$4, duracao_minutos=$5,
              comissao_percentual=$6, cor_agenda=$7, ativo=COALESCE($8, ativo)
       WHERE id=$9 AND salao_id=$10 RETURNING *`,
      [nome, descricao, categoria, valor, duracao_minutos, comissao_percentual, cor_agenda, ativo, id, req.salaoId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Serviço não encontrado' });

    res.json({ success: true, message: 'Serviço atualizado!', data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar serviço:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar serviço' });
  }
};

const remover = async (req, res) => {
  try {
    await query('UPDATE servicos SET ativo = false WHERE id = $1 AND salao_id = $2', [req.params.id, req.salaoId]);
    res.json({ success: true, message: 'Serviço removido' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao remover serviço' });
  }
};

module.exports = { listar, criar, atualizar, remover };
