const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows: stored } = await pool.query(
      `SELECT id, type, title, body, entity_id, read, created_at
       FROM notifications ORDER BY created_at DESC LIMIT 50`
    );

    const { rows: expiring } = await pool.query(`
      SELECT pr.id, pr.title, pr.expires_at, ch.name AS churrascaria_name, c.name AS company_name,
             COUNT(pri.id)::int AS item_count,
             COUNT(CASE WHEN pri.unit_price IS NOT NULL OR pri.ruptura THEN 1 END)::int AS filled_count
      FROM price_requests pr
      JOIN churrascarias ch ON ch.id = pr.churrascaria_id
      JOIN companies c ON c.id = pr.company_id
      LEFT JOIN price_request_items pri ON pri.request_id = pr.id
      WHERE pr.expires_at > NOW()
        AND pr.expires_at <= NOW() + INTERVAL '2 days'
      GROUP BY pr.id, ch.name, c.name
      HAVING COUNT(CASE WHEN pri.unit_price IS NOT NULL OR pri.ruptura THEN 1 END)::int < COUNT(pri.id)::int
    `);

    const expiringItems = expiring.map(r => {
      const expiresDate = new Date(r.expires_at).toLocaleDateString('pt-BR');
      const label = r.title || `Cotação #${String(r.id).padStart(4, '0')}`;
      return {
        id: `exp_${r.id}`,
        type: 'expiring',
        title: 'Cotação vencendo em breve',
        body: `${label} — ${r.company_name} (${r.churrascaria_name}) vence em ${expiresDate} com ${r.filled_count}/${r.item_count} itens preenchidos.`,
        entity_id: r.id,
        read: false,
        created_at: null,
      };
    });

    res.json([...expiringItems, ...stored]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET read = TRUE WHERE read = FALSE`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(`UPDATE notifications SET read = TRUE WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
