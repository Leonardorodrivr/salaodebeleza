// controllers/agendamentosController.js
const { query } = require('../config/database');

/**
 * GET /agendamentos - Listar agendamentos com filtros
 */
const listar = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const { data_inicio, data_fim, profissional_id, status, cliente_id } = req.query;

    let params = [salaoId];
    let conditions = ['a.salao_id = $1'];

    if (data_inicio) {
      params.push(data_inicio);
      conditions.push(`DATE(a.data_hora_inicio) >= $${params.length}`);
    }
    if (data_fim) {
      params.push(data_fim);
      conditions.push(`DATE(a.data_hora_inicio) <= $${params.length}`);
    }
    if (profissional_id) {
      params.push(profissional_id);
      conditions.push(`a.profissional_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (cliente_id) {
      params.push(cliente_id);
      conditions.push(`a.cliente_id = $${params.length}`);
    }

    const result = await query(
      `SELECT a.*,
              c.nome as cliente_nome, c.telefone as cliente_telefone, c.whatsapp as cliente_whatsapp,
              s.nome as servico_nome, s.duracao_minutos, s.cor_agenda, s.categoria as servico_categoria,
              u.nome as profissional_nome, u.foto_url as profissional_foto
       FROM agendamentos a
       LEFT JOIN clientes c ON a.cliente_id = c.id
       LEFT JOIN servicos s ON a.servico_id = s.id
       LEFT JOIN usuarios u ON a.profissional_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.data_hora_inicio ASC`,
      params
    );

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('Erro ao listar agendamentos:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar agendamentos' });
  }
};

/**
 * POST /agendamentos - Criar agendamento
 */
const criar = async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const {
      cliente_id, profissional_id, servico_id,
      data_hora_inicio, data_hora_fim,
      valor_cobrado, observacoes
    } = req.body;

    // Verificar conflito de horário
    const conflito = await query(
      `SELECT id FROM agendamentos
       WHERE salao_id = $1 
         AND profissional_id = $2
         AND status NOT IN ('cancelado', 'faltou')
         AND (
           (data_hora_inicio < $4 AND data_hora_fim > $3)
         )`,
      [salaoId, profissional_id, data_hora_inicio, data_hora_fim]
    );

    if (conflito.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Conflito de horário! A profissional já possui agendamento neste período.'
      });
    }

    const result = await query(
      `INSERT INTO agendamentos 
       (salao_id, cliente_id, profissional_id, servico_id, data_hora_inicio, data_hora_fim, valor_cobrado, observacoes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pendente') RETURNING *`,
      [salaoId, cliente_id, profissional_id, servico_id, data_hora_inicio, data_hora_fim, valor_cobrado, observacoes]
    );

    // Buscar detalhes completos
    const agendamento = await query(
      `SELECT a.*,
              c.nome as cliente_nome, c.whatsapp as cliente_whatsapp,
              s.nome as servico_nome, s.cor_agenda,
              u.nome as profissional_nome
       FROM agendamentos a
       LEFT JOIN clientes c ON a.cliente_id = c.id
       LEFT JOIN servicos s ON a.servico_id = s.id
       LEFT JOIN usuarios u ON a.profissional_id = u.id
       WHERE a.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      success: true,
      message: 'Agendamento criado com sucesso!',
      data: agendamento.rows[0]
    });

  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar agendamento' });
  }
};

/**
 * PUT /agendamentos/:id - Atualizar agendamento
 */
const atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const salaoId = req.salaoId;
    const { status, valor_cobrado, forma_pagamento, observacoes, data_hora_inicio, data_hora_fim } = req.body;

    const result = await query(
      `UPDATE agendamentos 
       SET status = COALESCE($1, status),
           valor_cobrado = COALESCE($2, valor_cobrado),
           forma_pagamento = COALESCE($3, forma_pagamento),
           observacoes = COALESCE($4, observacoes),
           data_hora_inicio = COALESCE($5, data_hora_inicio),
           data_hora_fim = COALESCE($6, data_hora_fim)
       WHERE id = $7 AND salao_id = $8 RETURNING *`,
      [status, valor_cobrado, forma_pagamento, observacoes, data_hora_inicio, data_hora_fim, id, salaoId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
    }

    // Se finalizado, criar lançamento financeiro automaticamente
    if (status === 'finalizado' && valor_cobrado) {
      const agendamento = result.rows[0];
      
      // Buscar nome do serviço para descrição
      const servico = await query('SELECT nome FROM servicos WHERE id = $1', [agendamento.servico_id]);
      const nomeServico = servico.rows[0]?.nome || 'Serviço';

      await query(
        `INSERT INTO financeiro (salao_id, agendamento_id, tipo, categoria, descricao, valor, forma_pagamento, profissional_id)
         VALUES ($1, $2, 'entrada', 'Serviços', $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          salaoId, id, nomeServico,
          parseFloat(valor_cobrado) - (agendamento.desconto || 0),
          forma_pagamento, agendamento.profissional_id
        ]
      );

      // Atualizar totais do cliente
      await query(
        `UPDATE clientes SET 
         total_visitas = total_visitas + 1,
         total_gasto = total_gasto + $1,
         ultima_visita = NOW()
         WHERE id = $2`,
        [parseFloat(valor_cobrado), agendamento.cliente_id]
      );
    }

    res.json({
      success: true,
      message: 'Agendamento atualizado!',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao atualizar agendamento:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar agendamento' });
  }
};

/**
 * DELETE /agendamentos/:id - Cancelar agendamento
 */
const cancelar = async (req, res) => {
  try {
    const { id } = req.params;
    const salaoId = req.salaoId;

    await query(
      `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 AND salao_id = $2`,
      [id, salaoId]
    );

    res.json({ success: true, message: 'Agendamento cancelado' });

  } catch (error) {
    console.error('Erro ao cancelar agendamento:', error);
    res.status(500).json({ success: false, message: 'Erro ao cancelar agendamento' });
  }
};

/**
 * GET /agendamentos/horarios-disponiveis - Horários livres por data/profissional
 */
const horariosDisponiveis = async (req, res) => {
  try {
    const { data, profissional_id, duracao_minutos = 60 } = req.query;
    const salaoId = req.salaoId;

    // Buscar agendamentos do dia
    const ocupados = await query(
      `SELECT data_hora_inicio, data_hora_fim FROM agendamentos
       WHERE salao_id = $1 AND profissional_id = $2
         AND DATE(data_hora_inicio) = $3
         AND status NOT IN ('cancelado', 'faltou')
       ORDER BY data_hora_inicio`,
      [salaoId, profissional_id, data]
    );

    // Buscar horários bloqueados
    const bloqueados = await query(
      `SELECT data_hora_inicio, data_hora_fim FROM horarios_bloqueados
       WHERE salao_id = $1 AND profissional_id = $2
         AND DATE(data_hora_inicio) = $3`,
      [salaoId, profissional_id, data]
    );

    // Gerar slots disponíveis (08:00 - 20:00, intervalos de 30min)
    const slots = [];
    const inicio = 8 * 60; // 08:00 em minutos
    const fim = 20 * 60;  // 20:00 em minutos
    const intervalo = 30;
    const duracaoMinutos = parseInt(duracao_minutos);

    for (let min = inicio; min + duracaoMinutos <= fim; min += intervalo) {
      const slotInicio = new Date(`${data}T${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}:00`);
      const slotFim = new Date(slotInicio.getTime() + duracaoMinutos * 60000);
      
      // Verificar se está ocupado
      const conflito = [...ocupados.rows, ...bloqueados.rows].some(ag => {
        const agInicio = new Date(ag.data_hora_inicio);
        const agFim = new Date(ag.data_hora_fim);
        return slotInicio < agFim && slotFim > agInicio;
      });

      slots.push({
        inicio: slotInicio.toISOString(),
        fim: slotFim.toISOString(),
        horario: slotInicio.toTimeString().substring(0, 5),
        disponivel: !conflito
      });
    }

    res.json({ success: true, data: slots });

  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar horários disponíveis' });
  }
};

module.exports = { listar, criar, atualizar, cancelar, horariosDisponiveis };
