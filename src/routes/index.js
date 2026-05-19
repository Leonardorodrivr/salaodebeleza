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

    res.json({
      success: true,
      data: {
        profissional,
        mes,
        atendimentos: atendimentos.rows,
        resumo: {
          totalAtendimentos: parseInt(total_atendimentos) || 0,
          totalServicos: parseFloat(total_servicos) || 0,
          totalComissao: parseFloat(total_comissao) || 0,
          metaMensal: parseFloat(profissional.meta_mensal) || 0,
          percentualMeta
        }
      }
    });
  } catch (error) {
    console.error('Erro no relatório da profissional:', error);
    res.status(500).json({ success: false, message: 'Erro ao gerar relatório' });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    timestamp: new Date().toISOString(),
    versao: '1.0.0'
  });
});

module.exports = router;

// Super Admin
const { router: superAdminRouter } = require('./superadmin');
router.use('/superadmin', superAdminRouter);
