// controllers/dashboardController.js
const { query } = require('../config/database');

/**
 * GET /dashboard/stats - Estatísticas gerais do dashboard
 */
const getStats = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const hoje = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const fimMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

    const [
      totalClientes,
      agendamentosHoje,
      faturamentoMes,
      agendamentosStatus,
      proximosAgendamentos,
      servicosMaisVendidos,
      faturamentoDiario,
      estoqueBaixo
    ] = await Promise.all([
      // Total de clientes ativos
      query('SELECT COUNT(*) as total FROM clientes WHERE salao_id = $1 AND ativo = true', [salaoId]),
      
      // Agendamentos de hoje
      query(
        `SELECT COUNT(*) as total FROM agendamentos 
         WHERE salao_id = $1 AND DATE(data_hora_inicio) = $2`,
        [salaoId, hoje]
      ),
      
      // Faturamento do mês (entradas financeiras)
      query(
        `SELECT COALESCE(SUM(valor), 0) as total FROM financeiro 
         WHERE salao_id = $1 AND tipo = 'entrada' 
         AND data_lancamento BETWEEN $2 AND $3`,
        [salaoId, inicioMes, fimMes]
      ),
      
      // Status dos agendamentos do mês
      query(
        `SELECT status, COUNT(*) as quantidade FROM agendamentos 
         WHERE salao_id = $1 AND DATE(data_hora_inicio) BETWEEN $2 AND $3
         GROUP BY status`,
        [salaoId, inicioMes, fimMes]
      ),
      
      // Próximos agendamentos do dia
      query(
        `SELECT a.id, a.data_hora_inicio, a.data_hora_fim, a.status,
                c.nome as cliente_nome, c.whatsapp as cliente_whatsapp,
                s.nome as servico_nome, s.cor_agenda,
                u.nome as profissional_nome
         FROM agendamentos a
         LEFT JOIN clientes c ON a.cliente_id = c.id
         LEFT JOIN servicos s ON a.servico_id = s.id
         LEFT JOIN usuarios u ON a.profissional_id = u.id
         WHERE a.salao_id = $1 AND DATE(a.data_hora_inicio) = $2
           AND a.status NOT IN ('cancelado', 'faltou')
         ORDER BY a.data_hora_inicio ASC
         LIMIT 10`,
        [salaoId, hoje]
      ),
      
      // Serviços mais vendidos no mês
      query(
        `SELECT s.nome, s.categoria, s.cor_agenda,
                COUNT(a.id) as quantidade,
                COALESCE(SUM(a.valor_cobrado), 0) as total_valor
         FROM agendamentos a
         JOIN servicos s ON a.servico_id = s.id
         WHERE a.salao_id = $1 
           AND DATE(a.data_hora_inicio) BETWEEN $2 AND $3
           AND a.status = 'finalizado'
         GROUP BY s.id, s.nome, s.categoria, s.cor_agenda
         ORDER BY quantidade DESC
         LIMIT 5`,
        [salaoId, inicioMes, fimMes]
      ),
      
      // Faturamento diário dos últimos 30 dias
      query(
        `SELECT DATE(data_lancamento) as data, 
                SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END) as entradas,
                SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END) as saidas
         FROM financeiro
         WHERE salao_id = $1 AND data_lancamento >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(data_lancamento)
         ORDER BY data ASC`,
        [salaoId]
      ),
      
      // Produtos com estoque baixo
      query(
        `SELECT nome, quantidade_atual, quantidade_minima, unidade
         FROM produtos
         WHERE salao_id = $1 AND ativo = true AND quantidade_atual <= quantidade_minima
         ORDER BY (quantidade_atual - quantidade_minima) ASC
         LIMIT 5`,
        [salaoId]
      )
    ]);

    // Calcular novos clientes do mês
    const novosClientesMes = await query(
      `SELECT COUNT(*) as total FROM clientes 
       WHERE salao_id = $1 AND DATE(created_at) BETWEEN $2 AND $3`,
      [salaoId, inicioMes, fimMes]
    );

    // Calcular taxa de ocupação
    const totalSlots = 8 * 22; // 8 horas por dia, ~22 dias úteis
    const agendamentosFinalizados = await query(
      `SELECT COUNT(*) as total FROM agendamentos
       WHERE salao_id = $1 AND status = 'finalizado'
       AND DATE(data_hora_inicio) BETWEEN $2 AND $3`,
      [salaoId, inicioMes, fimMes]
    );
    
    const taxaOcupacao = Math.min(
      Math.round((parseInt(agendamentosFinalizados.rows[0].total) / totalSlots) * 100),
      100
    );

    res.json({
      success: true,
      data: {
        resumo: {
          totalClientes: parseInt(totalClientes.rows[0].total),
          novosClientesMes: parseInt(novosClientesMes.rows[0].total),
          agendamentosHoje: parseInt(agendamentosHoje.rows[0].total),
          faturamentoMes: parseFloat(faturamentoMes.rows[0].total),
          taxaOcupacao
        },
        agendamentosStatus: agendamentosStatus.rows,
        proximosAgendamentos: proximosAgendamentos.rows,
        servicosMaisVendidos: servicosMaisVendidos.rows,
        faturamentoDiario: faturamentoDiario.rows,
        estoqueBaixo: estoqueBaixo.rows,
        periodo: { inicio: inicioMes, fim: fimMes, hoje }
      }
    });

  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ success: false, message: 'Erro ao carregar dashboard' });
  }
};

module.exports = { getStats };
