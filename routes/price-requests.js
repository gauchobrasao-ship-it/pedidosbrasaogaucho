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
             COUNT(pri.id)::int as item_count,
             COUNT(CASE WHEN pri.unit_price IS NOT NULL OR pri.ruptura THEN 1 END)::int as filled_count
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

router.get('/:id/detail', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pr.id, pr.token, pr.title, pr.expires_at, pr.last_filled_at, pr.vendor_notes,
             ch.name as churrascaria_name, c.name as company_name
      FROM price_requests pr
      JOIN churrascarias ch ON ch.id = pr.churrascaria_id
      JOIN companies c ON c.id = pr.company_id
      WHERE pr.id = $1
    `, [req.params.id]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Cotação não encontrada' });

    const { rows: items } = await pool.query(`
      SELECT pri.product_id, pri.quantity, pri.unit_price, pri.bulk_min_qty, pri.bulk_price, pri.ruptura,
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
      SELECT pri.product_id, pri.quantity, pri.unit_price, pri.bulk_min_qty, pri.bulk_price, pri.ruptura,
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
  const { items, vendor_notes } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Nenhum preço informado' });

  try {
    const { rows } = await pool.query('SELECT * FROM price_requests WHERE token = $1', [req.params.token]);
    const request = rows[0];
    if (!request) return res.status(404).json({ error: 'Cotação não encontrada' });
    if (new Date(request.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado' });

    const rupturaItems = items.filter(i => i.ruptura);
    const filled = items.filter(i => parseFloat(i.unit_price) > 0);
    if (!filled.length && !rupturaItems.length) return res.status(400).json({ error: 'Informe pelo menos um preço ou marque ruptura' });

    await withTransaction(async (client) => {
      for (const item of rupturaItems) {
        await client.query(
          `UPDATE price_request_items SET ruptura = true, unit_price = NULL, bulk_min_qty = NULL, bulk_price = NULL WHERE request_id = $1 AND product_id = $2`,
          [request.id, item.product_id]
        );
      }
      for (const item of filled) {
        const price     = parseFloat(item.unit_price);
        const bulkQty   = parseFloat(item.bulk_min_qty) > 0 ? parseFloat(item.bulk_min_qty) : null;
        const bulkPrice = parseFloat(item.bulk_price)   > 0 ? parseFloat(item.bulk_price)   : null;

        const { rows: cpRows } = await client.query(
          `SELECT price, p.name as product_name FROM company_products cp
           JOIN products p ON p.id = cp.product_id
           WHERE cp.churrascaria_id = $1 AND cp.company_id = $2 AND cp.product_id = $3`,
          [request.churrascaria_id, request.company_id, item.product_id]
        );
        const oldPrice = parseFloat(cpRows[0]?.price || 0);
        if (oldPrice > 0 && price > oldPrice * 1.05) {
          const pct = ((price - oldPrice) / oldPrice * 100).toFixed(1);
          const productName = cpRows[0]?.product_name || `Produto #${item.product_id}`;
          const { rows: compRows } = await client.query('SELECT name FROM companies WHERE id = $1', [request.company_id]);
          const companyName = compRows[0]?.name || 'fornecedor';
          await client.query(
            `INSERT INTO notifications (type, title, body, entity_id) VALUES ($1,$2,$3,$4)`,
            [
              'price_increase',
              `Aumento de preço: ${productName}`,
              `${productName} subiu ${pct}% (de R$ ${oldPrice.toFixed(2)} para R$ ${price.toFixed(2)}) na cotação de ${companyName}.`,
              request.id,
            ]
          );
        }

        await client.query(`
          INSERT INTO company_products (churrascaria_id, company_id, product_id, price, bulk_min_qty, bulk_price, active)
          VALUES ($1,$2,$3,$4,$5,$6,1)
          ON CONFLICT (churrascaria_id, company_id, product_id)
          DO UPDATE SET price = EXCLUDED.price, bulk_min_qty = EXCLUDED.bulk_min_qty, bulk_price = EXCLUDED.bulk_price, updated_at = NOW()
        `, [request.churrascaria_id, request.company_id, item.product_id, price, bulkQty, bulkPrice]);
        await client.query(
          `UPDATE price_request_items
           SET unit_price = $1, bulk_min_qty = $2, bulk_price = $3, ruptura = false
           WHERE request_id = $4 AND product_id = $5`,
          [price, bulkQty, bulkPrice, request.id, item.product_id]
        );
      }
      await client.query(
        'UPDATE price_requests SET last_filled_at = NOW(), vendor_notes = $1 WHERE id = $2',
        [vendor_notes?.trim() || null, request.id]
      );
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
