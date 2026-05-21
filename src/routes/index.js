// routes/index.js - Roteador principal da API
const express = require('express');
const router = express.Router();

const { authenticate, authorize } = require('../middleware/auth');

// Controllers
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const clientesController = require('../controllers/clientesController');
const agendamentosController = require('../controllers/agendamentosController');
const financeiroController = require('../controllers/financeiroController');
const servicosController = require('../controllers/servicosController');
const estoqueController = require('../controllers/estoqueController');

// ============================================================
// AUTH - Rotas públicas
// ============================================================
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Auth protegidas
router.get('/auth/me', authenticate, authController.me);
router.put('/auth/profile', authenticate, authController.updateProfile);
router.post('/auth/change-password', authenticate, authController.changePassword);

// ============================================================
// DASHBOARD
// ============================================================
router.get('/dashboard/stats', authenticate, dashboardController.getStats);

// ============================================================
// CLIENTES
// ============================================================
router.get('/clientes', authenticate, clientesController.listar);
router.get('/clientes/aniversariantes', authenticate, clientesController.aniversariantes);
router.get('/clientes/:id', authenticate, clientesController.detalhar);
router.post('/clientes', authenticate, clientesController.criar);
router.put('/clientes/:id', authenticate, clientesController.atualizar);
router.delete('/clientes/:id', authenticate, clientesController.desativar);

// ============================================================
// AGENDAMENTOS
// ============================================================
router.get('/agendamentos', authenticate, agendamentosController.listar);
router.get('/agendamentos/horarios-disponiveis', authenticate, agendamentosController.horariosDisponiveis);
router.post('/agendamentos', authenticate, agendamentosController.criar);
router.put('/agendamentos/:id', authenticate, agendamentosController.atualizar);
router.delete('/agendamentos/:id', authenticate, agendamentosController.cancelar);

// ============================================================
// FINANCEIRO
// ============================================================
router.get('/financeiro', authenticate, financeiroController.listar);
router.get('/financeiro/relatorio-mensal', authenticate, financeiroController.relatorioMensal);
router.post('/financeiro', authenticate, financeiroController.criar);
router.delete('/financeiro/:id', authenticate, authorize('admin'), financeiroController.remover);

// ============================================================
// SERVIÇOS
// ============================================================
router.get('/servicos', authenticate, servicosController.listar);
router.post('/servicos', authenticate, authorize('admin'), servicosController.criar);
router.put('/servicos/:id', authenticate, authorize('admin'), servicosController.atualizar);
router.delete('/servicos/:id', authenticate, authorize('admin'), servicosController.remover);

// ============================================================
// ESTOQUE
// ============================================================
router.get('/estoque', authenticate, estoqueController.listar);
router.post('/estoque', authenticate, estoqueController.criar);
router.put('/estoque/:id', authenticate, estoqueController.atualizar);
router.post('/estoque/:id/movimentar', authenticate, estoqueController.movimentar);

// ============================================================
// WHATSAPP - Gerador de links e mensagens
// ============================================================
router.post('/whatsapp/lembrete', authenticate, async (req, res) => {
  try {
    const { numero, nome, servico, data, hora } = req.body;
    
    const numeroLimpo = numero.replace(/\D/g, '');
    const mensagem = encodeURIComponent(
      `Olá ${nome}! 💅\n\nLembrando do seu agendamento:\n` +
      `📅 ${data} às ${hora}\n✨ Serviço: ${servico}\n\n` +
      `Confirme presença respondendo OK. Qualquer dúvida estamos à disposição! 🌸`
    );
    
    const link = `https://wa.me/55${numeroLimpo}?text=${mensagem}`;
    
    res.json({ success: true, data: { link, mensagem: decodeURIComponent(mensagem) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro ao gerar link WhatsApp' });
  }
});

// ============================================================
// PROFISSIONAIS - Relatório da profissional
// ============================================================
router.get('/profissional/relatorio', authenticate, async (req, res) => {
  try {
    const salaoId = req.salaoId;
    const profissionalId = req.query.profissional_id || req.usuario.id;
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const [ano, mesNum] = mes.split('-');

    const [atendimentos, ganhos, meta] = await Promise.all([
      // Atendimentos do mês
      require('../config/database').query(
        `SELECT a.*, c.nome as cliente_nome, s.nome as servico_nome
         FROM agendamentos a
         LEFT JOIN clientes c ON a.cliente_id = c.id
         LEFT JOIN servicos s ON a.servico_id = s.id
         WHERE a.salao_id = $1 AND a.profissional_id = $2
           AND EXTRACT(YEAR FROM a.data_hora_inicio) = $3
           AND EXTRACT(MONTH FROM a.data_hora_inicio) = $4
           AND a.status = 'finalizado'
         ORDER BY a.data_hora_inicio DESC`,
        [salaoId, profissionalId, ano, mesNum]
      ),
      // Total ganho
      require('../config/database').query(
        `SELECT COALESCE(SUM(f.valor * (u.comissao_percentual / 100)), 0) as total_comissao,
                COALESCE(SUM(f.valor), 0) as total_servicos,
                COUNT(a.id) as total_atendimentos
         FROM agendamentos a
         JOIN financeiro f ON f.agendamento_id = a.id
         JOIN usuarios u ON u.id = a.profissional_id
         WHERE a.salao_id = $1 AND a.profissional_id = $2
           AND EXTRACT(YEAR FROM a.data_hora_inicio) = $3
           AND EXTRACT(MONTH FROM a.data_hora_inicio) = $4`,
        [salaoId, profissionalId, ano, mesNum]
      ),
      // Meta da profissional
      require('../config/database').query(
        'SELECT meta_mensal, comissao_percentual, nome FROM usuarios WHERE id = $1',
        [profissionalId]
      )
    ]);

    const profissional = meta.rows[0] || {};
    const { total_comissao, total_servicos, total_atendimentos } = ganhos.rows[0];
    const percentualMeta = profissional.meta_mensal
      ? Math.min(Math.round((parseFloat(total_comissao) / profissional.meta_mensal) * 100), 100)
      : 0;


// ============================================================
// ROTAS PÚBLICAS - Agendamento Online por Salão
// ============================================================

// GET /api/public/salao/:salaoId - Info do salão + serviços
router.get('/public/salao/:salaoId', async (req, res) => {
  try {
    const { query } = require('../config/database');
    const { salaoId } = req.params;

    const [salao, servicos] = await Promise.all([
      query(
        'SELECT id, nome, telefone, logo_url FROM saloes WHERE id = $1 AND ativo = true',
        [salaoId]
      ),
      query(
        `SELECT id, nome, categoria, valor, duracao_minutos, cor_agenda, descricao
         FROM servicos WHERE salao_id = $1 AND ativo = true ORDER BY categoria, nome`,
        [salaoId]
      )
    ]);

    if (salao.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Salão não encontrado' });
    }

    res.json({
      success: true,
      data: {
        salao: salao.rows[0],
        servicos: servicos.rows
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// GET /api/public/horarios/:salaoId - Horários disponíveis
router.get('/public/horarios/:salaoId', async (req, res) => {
  try {
    const { query } = require('../config/database');
    const { salaoId } = req.params;
    const { data, duracao_minutos = 60 } = req.query;

    if (!data) return res.status(400).json({ success: false, message: 'Data obrigatória' });

    const ocupados = await query(
      `SELECT data_hora_inicio, data_hora_fim FROM agendamentos
       WHERE salao_id = $1 AND DATE(data_hora_inicio) = $2
       AND status NOT IN ('cancelado','faltou')`,
      [salaoId, data]
    );

    const slots = [];
    const dur = parseInt(duracao_minutos);

    for (let min = 9 * 60; min + dur <= 19 * 60; min += 30) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      const slotStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      const slotInicio = new Date(`${data}T${slotStr}:00`);
      const slotFim = new Date(slotInicio.getTime() + dur * 60000);

      const ocupado = ocupados.rows.some(ag => {
        const ai = new Date(ag.data_hora_inicio);
        const af = new Date(ag.data_hora_fim);
        return slotInicio < af && slotFim > ai;
      });

      slots.push({ horario: slotStr, disponivel: !ocupado });
    }

    res.json({ success: true, data: slots });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// POST /api/public/agendamento/:salaoId - Criar agendamento
router.post('/public/agendamento/:salaoId', async (req, res) => {
  try {
    const { query } = require('../config/database');
    const { salaoId } = req.params;
    const { nome, whatsapp, email, servico_id, data_hora_inicio } = req.body;

    if (!nome || !whatsapp || !servico_id || !data_hora_inicio) {
      return res.status(400).json({ success: false, message: 'Preencha todos os campos obrigatórios' });
    }

    // Verificar salão
    const salaoRes = await query(
      'SELECT id, nome, telefone FROM saloes WHERE id = $1 AND ativo = true',
      [salaoId]
    );
    if (salaoRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Salão não encontrado' });
    }
    const salao = salaoRes.rows[0];

    // Buscar serviço
    const svcRes = await query(
      'SELECT id, nome, valor, duracao_minutos FROM servicos WHERE id = $1 AND salao_id = $2',
      [servico_id, salaoId]
    );
    if (svcRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Serviço não encontrado' });
    }
    const servico = svcRes.rows[0];

    // Verificar conflito de horário
    const inicio = new Date(data_hora_inicio);
    const fim = new Date(inicio.getTime() + servico.duracao_minutos * 60000);

    const conflito = await query(
      `SELECT id FROM agendamentos
       WHERE salao_id = $1 AND status NOT IN ('cancelado','faltou')
       AND data_hora_inicio < $3 AND data_hora_fim > $2`,
      [salaoId, inicio.toISOString(), fim.toISOString()]
    );

    if (conflito.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Este horário já está ocupado. Por favor escolha outro.' });
    }

    // Buscar ou criar cliente
    let clienteId;
    const clienteExiste = await query(
      'SELECT id FROM clientes WHERE whatsapp = $1 AND salao_id = $2',
      [whatsapp, salaoId]
    );

    if (clienteExiste.rows.length > 0) {
      clienteId = clienteExiste.rows[0].id;
      await query(
        'UPDATE clientes SET nome = $1, email = COALESCE($2, email) WHERE id = $3',
        [nome, email || null, clienteId]
      );
    } else {
      const novoCliente = await query(
        'INSERT INTO clientes (salao_id, nome, whatsapp, telefone, email) VALUES ($1,$2,$3,$3,$4) RETURNING id',
        [salaoId, nome, whatsapp, email || null]
      );
      clienteId = novoCliente.rows[0].id;
    }

    // Buscar profissional do salão
    const profRes = await query(
      'SELECT id FROM usuarios WHERE salao_id = $1 AND ativo = true AND cargo = $2 LIMIT 1',
      [salaoId, 'admin']
    );
    const profissionalId = profRes.rows[0]?.id || null;

    // Criar agendamento
    const agRes = await query(
      `INSERT INTO agendamentos
       (salao_id, cliente_id, profissional_id, servico_id, data_hora_inicio, data_hora_fim, valor_cobrado, status, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente',$8) RETURNING id`,
      [salaoId, clienteId, profissionalId, servico_id,
       inicio.toISOString(), fim.toISOString(), servico.valor,
       `Agendamento online - Cliente: ${nome} - WhatsApp: ${whatsapp}`]
    );

    res.status(201).json({
      success: true,
      message: 'Agendamento criado com sucesso!',
      data: {
        id: agRes.rows[0].id,
        salao_nome: salao.nome,
        salao_telefone: salao.telefone,
        servico_nome: servico.nome,
        valor: servico.valor,
        inicio: inicio.toISOString(),
        fim: fim.toISOString()
      }
    });
  } catch (e) {
    console.error('Erro agendamento público:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
