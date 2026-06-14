const express = require('express');
const crypto = require('crypto');
const { getDb, withTransaction } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, (req, res) => {
  const { churrascaria_id, company_ids, title, expires_in_days, items } = req.body;
  if (!churrascaria_id || !company_ids?.length || !items?.length) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }
  const db = getDb();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (parseInt(expires_in_days) || 7));
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  const requests = withTransaction(db, () => {
    return company_ids.map(companyId => {
      const token = crypto.randomBytes(16).toString('hex');
      const result = db.prepare(
        `INSERT INTO price_requests (token, churrascaria_id, company_id, title, created_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(token, churrascaria_id, companyId, title || null, req.user.id, expiresAt.toISOString());
      const requestId = Number(result.lastInsertRowid);
      items.forEach(item => {
        db.prepare('INSERT INTO price_request_items (request_id, product_id, quantity) VALUES (?, ?, ?)')
          .run(requestId, item.product_id, item.quantity);
      });
      const company = db.prepare('SELECT name FROM companies WHERE id = ?').get(companyId);
      return { token, company_id: companyId, company_name: company?.name, url: `${baseUrl}/cotacao/${token}` };
    });
  });

  res.json({ requests });
});

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT pr.id, pr.token, pr.title, pr.expires_at, pr.last_filled_at, pr.created_at,
           ch.name as churrascaria_name, c.name as company_name,
           COUNT(pri.id) as item_count
    FROM price_requests pr
    JOIN churrascarias ch ON ch.id = pr.churrascaria_id
    JOIN companies c ON c.id = pr.company_id
    LEFT JOIN price_request_items pri ON pri.request_id = pr.id
    GROUP BY pr.id
    ORDER BY pr.created_at DESC
    LIMIT 100
  `).all();
  res.json(rows);
});

router.get('/:token', (req, res) => {
  const db = getDb();
  const request = db.prepare(`
    SELECT pr.id, pr.title, pr.expires_at, pr.last_filled_at,
           ch.name as churrascaria_name, c.name as company_name
    FROM price_requests pr
    JOIN churrascarias ch ON ch.id = pr.churrascaria_id
    JOIN companies c ON c.id = pr.company_id
    WHERE pr.token = ?
  `).get(req.params.token);

  if (!request) return res.status(404).json({ error: 'Cotação não encontrada' });
  if (new Date(request.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Este link de cotação expirou.' });
  }

  const items = db.prepare(`
    SELECT pri.product_id, pri.quantity, pri.unit_price,
           p.name as product_name, p.unit, p.brand, cat.name as category_name
    FROM price_request_items pri
    JOIN products p ON p.id = pri.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE pri.request_id = ?
    ORDER BY cat.name, p.name
  `).all(request.id);

  res.json({ ...request, items });
});

router.post('/:token/submit', (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Nenhum preço informado' });

  const db = getDb();
  const request = db.prepare('SELECT * FROM price_requests WHERE token = ?').get(req.params.token);
  if (!request) return res.status(404).json({ error: 'Cotação não encontrada' });
  if (new Date(request.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirado' });

  const filled = items.filter(i => parseFloat(i.unit_price) > 0);
  if (!filled.length) return res.status(400).json({ error: 'Informe pelo menos um preço' });

  withTransaction(db, () => {
    filled.forEach(item => {
      const price = parseFloat(item.unit_price);
      db.prepare(`
        INSERT INTO company_products (churrascaria_id, company_id, product_id, price, active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(churrascaria_id, company_id, product_id)
        DO UPDATE SET price = ?, updated_at = CURRENT_TIMESTAMP
      `).run(request.churrascaria_id, request.company_id, item.product_id, price, price);
      db.prepare(`UPDATE price_request_items SET unit_price = ? WHERE request_id = ? AND product_id = ?`)
        .run(price, request.id, item.product_id);
    });
    db.prepare(`UPDATE price_requests SET last_filled_at = CURRENT_TIMESTAMP WHERE id = ?`).run(request.id);
  });

  res.json({ message: 'Preços enviados com sucesso!' });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM price_request_items WHERE request_id = ?').run(req.params.id);
  db.prepare('DELETE FROM price_requests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Cotação excluída' });
});

module.exports = router;
