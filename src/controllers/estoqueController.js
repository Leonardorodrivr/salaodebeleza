// controllers/estoqueController.js
const { query } = require('../config/database');

const listar = async (req, res) => {
  try {
    const { busca, categoria, alerta } = req.query;
    let params = [req.salaoId];
    let conditions = ['salao_id = $1', 'ativo = true'];

    if (busca) { params.push(`%${busca}%`); conditions.push(`(nome ILIKE $${params.length} OR marca ILIKE $${params.length})`); }
    if (categoria) { params.push(categoria); conditions.push(`categoria = $${params.length}`); }
    if (alerta === 'true') conditions.push('quantidade_atual <= quantidade_minima');

    const result = await query(
      `SELECT *, (quantidade_atual <= quantidade_minima) as alerta_estoque
       FROM produtos WHERE ${conditions.join(' AND ')}
       ORDER BY categoria, nome`,
      params
    );

    const resumo = await query(
      `SELECT 
         COUNT(*) as total_produtos,
         COUNT(*) FILTER (WHERE quantidade_atual <= quantidade_minima) as produtos_alerta,
         COALESCE(SUM(quantidade_atual * COALESCE(preco_custo, 0)), 0) as valor_estoque
       FROM produtos WHERE salao_id = $1 AND ativo = true`,
      [req.salaoId]
    );

    res.json({ success: true, data: result.rows, resumo: resumo.rows[0] });
  } catch (error) {
    console.error('Erro ao listar estoque:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar produtos' });
  }
};

const criar = async (req, res) => {
  try {
    const { nome, marca, categoria, quantidade_atual, quantidade_minima, unidade, preco_custo, preco_venda } = req.body;

    const result = await query(
      `INSERT INTO produtos (salao_id, nome, marca, categoria, quantidade_atual, quantidade_minima, unidade, preco_custo, preco_venda)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.salaoId, nome, marca, categoria, quantidade_atual, quantidade_minima, unidade, preco_custo, preco_venda]
    );

    res.status(201).json({ success: true, message: 'Produto cadastrado!', data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ success: false, message: 'Erro ao cadastrar produto' });
  }
};

const movimentar = async (req, res) => {
  try {
    const { id } = req.params;
    const { tipo, quantidade, motivo } = req.body;

    const produto = await query('SELECT * FROM produtos WHERE id = $1 AND salao_id = $2', [id, req.salaoId]);
    if (produto.rows.length === 0) return res.status(404).json({ success: false, message: 'Produto não encontrado' });

    const qtdAtual = parseFloat(produto.rows[0].quantidade_atual);
    const qtdMovimento = parseFloat(quantidade);
    const novaQtd = tipo === 'entrada' ? qtdAtual + qtdMovimento : qtdAtual - qtdMovimento;

    if (novaQtd < 0) {
      return res.status(400).json({ success: false, message: 'Quantidade insuficiente em estoque' });
    }

    await Promise.all([
      query('UPDATE produtos SET quantidade_atual = $1 WHERE id = $2', [novaQtd, id]),
      query(
        `INSERT INTO movimentacao_estoque (salao_id, produto_id, tipo, quantidade, quantidade_anterior, motivo, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.salaoId, id, tipo, quantidade, qtdAtual, motivo, req.usuario.id]
      )
    ]);

    res.json({ success: true, message: 'Movimentação registrada!', novaQuantidade: novaQtd });
  } catch (error) {
    console.error('Erro na movimentação:', error);
    res.status(500).json({ success: false, message: 'Erro ao movimentar estoque' });
  }
};

const atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, marca, categoria, quantidade_minima, preco_custo, preco_venda, ativo } = req.body;

    const result = await query(
      `UPDATE produtos SET nome=$1, marca=$2, categoria=$3, quantidade_minima=$4, preco_custo=$5, preco_venda=$6, ativo=COALESCE($7,ativo)
       WHERE id=$8 AND salao_id=$9 RETURNING *`,
      [nome, marca, categoria, quantidade_minima, preco_custo, preco_venda, ativo, id, req.salaoId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Produto não encontrado' });
    res.json({ success: true, message: 'Produto atualizado!', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar produto' });
  }
};

module.exports = { listar, criar, atualizar, movimentar };
