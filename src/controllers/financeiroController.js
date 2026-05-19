// controllers/financeiroController.js
const { query } = require('../config/database');

/**
 * GET /financeiro - Listar lançamentos financeiros
 */
const listar = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const { data_inicio, data_fim, tipo, forma_pagamento, pagina = 1, limite = 30 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    let params = [salaoId];
    let conditions = ['f.salao_id = $1'];

    if (data_inicio) { params.push(data_inicio); conditions.push(`f.data_lancamento >= $${params.length}`); }
    if (data_fim) { params.push(data_fim); conditions.push(`f.data_lancamento <= $${params.length}`); }
    if (tipo) { params.push(tipo); conditions.push(`f.tipo = $${params.length}`); }
    if (forma_pagamento) { params.push(forma_pagamento); conditions.push(`f.forma_pagamento = $${params.length}`); }

    const [lancamentos, totais] = await Promise.all([
      query(
        `SELECT f.*, u.nome as profissional_nome
         FROM financeiro f
         LEFT JOIN usuarios u ON f.profissional_id = u.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY f.data_lancamento DESC, f.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limite), offset]
      ),
      query(
        `SELECT 
           SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) as total_entradas,
           SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as total_saidas,
           COUNT(*) as total_registros
         FROM financeiro f
         WHERE ${conditions.join(' AND ')}`,
        params
      )
    ]);

    const { total_entradas, total_saidas, total_registros } = totais.rows[0];

    res.json({
      success: true,
      data: lancamentos.rows,
      resumo: {
        totalEntradas: parseFloat(total_entradas) || 0,
        totalSaidas: parseFloat(total_saidas) || 0,
        saldo: (parseFloat(total_entradas) || 0) - (parseFloat(total_saidas) || 0),
        totalRegistros: parseInt(total_registros)
      },
      paginacao: {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(parseInt(total_registros) / parseInt(limite))
      }
    });

  } catch (error) {
    console.error('Erro ao listar financeiro:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar lançamentos' });
  }
};

/**
 * POST /financeiro - Criar lançamento manual
 */
const criar = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const { tipo, categoria, descricao, valor, forma_pagamento, data_lancamento, observacoes, profissional_id } = req.body;

    const result = await query(
      `INSERT INTO financeiro (salao_id, tipo, categoria, descricao, valor, forma_pagamento, data_lancamento, observacoes, profissional_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [salaoId, tipo, categoria, descricao, valor, forma_pagamento, data_lancamento || 'today', observacoes, profissional_id]
    );

    res.status(201).json({
      success: true,
      message: 'Lançamento registrado com sucesso!',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar lançamento:', error);
    res.status(500).json({ success: false, message: 'Erro ao registrar lançamento' });
  }
};

/**
 * GET /financeiro/relatorio-mensal - Relatório por mês
 */
const relatorioMensal = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const ano = req.query.ano || new Date().getFullYear();

    const [mensal, porCategoria, porFormaPagamento] = await Promise.all([
      // Faturamento mês a mês
      query(
        `SELECT 
           EXTRACT(MONTH FROM data_lancamento) as mes,
           TO_CHAR(data_lancamento, 'Month') as nome_mes,
           SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) as entradas,
           SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as saidas,
           SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END) as saldo
         FROM financeiro
         WHERE salao_id = $1 AND EXTRACT(YEAR FROM data_lancamento) = $2
         GROUP BY EXTRACT(MONTH FROM data_lancamento), TO_CHAR(data_lancamento, 'Month')
         ORDER BY mes ASC`,
        [salaoId, ano]
      ),
      // Por categoria
      query(
        `SELECT tipo, categoria, SUM(valor) as total, COUNT(*) as quantidade
         FROM financeiro
         WHERE salao_id = $1 AND EXTRACT(YEAR FROM data_lancamento) = $2
         GROUP BY tipo, categoria
         ORDER BY total DESC`,
        [salaoId, ano]
      ),
      // Por forma de pagamento
      query(
        `SELECT forma_pagamento, SUM(valor) as total, COUNT(*) as quantidade
         FROM financeiro
         WHERE salao_id = $1 AND tipo = 'entrada'
           AND EXTRACT(YEAR FROM data_lancamento) = $2
         GROUP BY forma_pagamento
         ORDER BY total DESC`,
        [salaoId, ano]
      )
    ]);

    res.json({
      success: true,
      data: {
        mensal: mensal.rows,
        porCategoria: porCategoria.rows,
        porFormaPagamento: porFormaPagamento.rows,
        ano: parseInt(ano)
      }
    });

  } catch (error) {
    console.error('Erro no relatório:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar relatório' });
  }
};

/**
 * DELETE /financeiro/:id - Remover lançamento
 */
const remover = async (req, res) => {
  try {
    const { id } = req.params;
    const salaoId = req.salaoId;

    await query('DELETE FROM financeiro WHERE id = $1 AND salao_id = $2', [id, salaoId]);

    res.json({ success: true, message: 'Lançamento removido' });

  } catch (error) {
    console.error('Erro ao remover lançamento:', error);
    res.status(500).json({ success: false, message: 'Erro ao remover lançamento' });
  }
};

module.exports = { listar, criar, relatorioMensal, remover };
