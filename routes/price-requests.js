const express = require('express');
const crypto = require('crypto');
const { pool, withTransaction } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  const { churrascaria_id, company_ids, title, expires_in_days, items } = req.body;
  if (!churrascaria_id || !company_ids?.length || !items?.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (parseInt(expires_in_days) || 7));
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  try {
    const requests = await withTransaction(async (client) => {
      return Promise.all(company_ids.map(async (companyId) => {
        const token = crypto.randomBytes(16).toString('hex');
        const { rows } = await client.query(
          `INSERT INTO price_requests (token, churrascaria_id, company_id, title, created_by, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [token, churrascaria_id, companyId, title || null, req.user.id, expiresAt.toISOString()]
        );
        const requestId = rows[0].id;
        for (const item of items) {
          await client.query(
            'INSERT INTO price_request_items (request_id, product_id, quantity) VALUES ($1,$2,$3)',
            [requestId, item.product_id, item.quantity]
          );
        }
        const { rows: compRows } = await client.query('SELECT name FROM companies WHERE id = $1', [companyId]);
        return { token, company_id: companyId, company_name: compRows[0]?.name, url: `${baseUrl}/cotacao/${token}` };
      }));
    });
    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar solicitações' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pr.id, pr.token, pr.title, pr.expires_at, pr.last_filled_at, pr.created_at,
             ch.name as churrascaria_name, c.name as company_name,
             COUNT(pri.id)::int as item_count
      FROM price_requests pr
      JOIN churrascarias ch ON ch.id = pr.churrascaria_id
      JOIN companies c ON c.id = pr.company_id
      LEFT JOIN price_request_items pri ON pri.request_id = pr.id
      GROUP BY pr.id, ch.name, c.name
      ORDER BY pr.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pr.id, pr.title, pr.expires_at, pr.last_filled_at,
             ch.name as churrascaria_name, c.name as company_name
      FROM price_requests pr
      JOIN churrascarias ch ON ch.id = pr.churrascaria_id
      JOIN companies c ON c.id = pr.company_id
      WHERE pr.token = $1
    `, [req.params.token]);

    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Cotação não encontrada' });
    if (new Date(request.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Este link de cotação expirou.' });
    }

    const { rows: items } = await pool.query(`
      SELECT pri.product_id, pri.quantity, pri.unit_price,
             p.name as product_name, p.unit, p.brand, cat.name as category_name
      FROM price_request_items pri
      JOIN products p ON p.id = pri.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE pri.request_id = $1
      ORDER BY cat.name, p.name
    `, [request.id]);

    res.json({ ...request, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:token/submit', async (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Nenhum preço informado' });

  try {
    const { rows } = await pool.query('SELECT * FROM price_requests WHERE token = $1', [req.params.token]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Cotação não encontrada' });
    if (new Date(request.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado' });

    const filled = items.filter(i => parseFloat(i.unit_price) > 0);
    if (!filled.length) return res.status(400).json({ error: 'Informe pelo menos um preço' });

    await withTransaction(async (client) => {
      for (const item of filled) {
        const price = parseFloat(item.unit_price);
        await client.query(`
          INSERT INTO company_products (churrascaria_id, company_id, product_id, price, active)
          VALUES ($1,$2,$3,$4,1)
          ON CONFLICT (churrascaria_id, company_id, product_id)
          DO UPDATE SET price = EXCLUDED.price, updated_at = NOW()
        `, [request.churrascaria_id, request.company_id, item.product_id, price]);
        await client.query(
          'UPDATE price_request_items SET unit_price = $1 WHERE request_id = $2 AND product_id = $3',
          [price, request.id, item.product_id]
        );
      }
      await client.query('UPDATE price_requests SET last_filled_at = NOW() WHERE id = $1', [request.id]);
    });

    res.json({ message: 'Preços enviados com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM price_request_items WHERE request_id = $1', [req.params.id]);
    await pool.query('DELETE FROM price_requests WHERE id = $1', [req.params.id]);
    res.json({ message: 'Cotação excluída' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
