const express = require('express');
const { getDb, withTransaction } = require('../database/db');
const { authMiddleware, requirePermission, getAllowedChurrascarias } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, requirePermission('manage_quotations'), (req, res) => {
  const db = getDb();
  const { churrascaria_id, company_id } = req.query;
  let query = `
    SELECT q.*, ch.name as churrascaria_name, c.name as company_name, u.name as user_name,
           COUNT(qi.id) as item_count
    FROM quotations q
    JOIN churrascarias ch ON ch.id = q.churrascaria_id
    JOIN companies c ON c.id = q.company_id
    JOIN users u ON u.id = q.user_id
    LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
    WHERE 1=1
  `;
  const params = [];
  if (churrascaria_id) { query += ' AND q.churrascaria_id = ?'; params.push(churrascaria_id); }
  if (company_id) { query += ' AND q.company_id = ?'; params.push(company_id); }
  const allowed = getAllowedChurrascarias(req.user);
  if (allowed) { query += ` AND q.churrascaria_id IN (${allowed.map(() => '?').join(',')})`; params.push(...allowed); }
  query += ' GROUP BY q.id ORDER BY q.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', authMiddleware, requirePermission('manage_quotations'), (req, res) => {
  const db = getDb();
  const allowed = getAllowedChurrascarias(req.user);
  const extra = allowed ? ` AND q.churrascaria_id IN (${allowed.map(() => '?').join(',')})` : '';
  const quotation = db.prepare(`
    SELECT q.*, ch.name as churrascaria_name, c.name as company_name, u.name as user_name
    FROM quotations q
    JOIN churrascarias ch ON ch.id = q.churrascaria_id
    JOIN companies c ON c.id = q.company_id
    JOIN users u ON u.id = q.user_id
    WHERE q.id = ?${extra}
  `).get(req.params.id, ...(allowed || []));
  if (!quotation) return res.status(404).json({ error: 'Cotação não encontrada' });

  quotation.items = db.prepare(`
    SELECT qi.*, p.name as product_name, p.unit, cat.name as category_name
    FROM quotation_items qi
    JOIN products p ON p.id = qi.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE qi.quotation_id = ?
    ORDER BY cat.name, p.name
  `).all(req.params.id);

  res.json(quotation);
});

router.post('/', authMiddleware, requirePermission('manage_quotations'), (req, res) => {
  const { churrascaria_id, company_id, week_reference, observations, items } = req.body;
  if (!churrascaria_id || !company_id) return res.status(400).json({ error: 'Churrascaria e empresa são obrigatórios' });

  const db = getDb();

  const quotationId = withTransaction(db, () => {
    const result = db.prepare(
      'INSERT INTO quotations (churrascaria_id, company_id, user_id, week_reference, observations) VALUES (?, ?, ?, ?, ?)'
    ).run(churrascaria_id, company_id, req.user.id, week_reference || null, observations || null);
    const id = Number(result.lastInsertRowid);

    if (items && items.length > 0) {
      for (const item of items) {
        db.prepare('INSERT INTO quotation_items (quotation_id, product_id, previous_price, new_price) VALUES (?, ?, ?, ?)')
          .run(id, item.product_id, item.previous_price || 0, item.new_price || 0);
        db.prepare('UPDATE company_products SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE churrascaria_id = ? AND company_id = ? AND product_id = ?')
          .run(item.new_price || 0, churrascaria_id, company_id, item.product_id);
      }
    }
    return id;
  });

  res.json({ id: quotationId, message: 'Cotação salva e preços atualizados' });
});

router.delete('/:id', authMiddleware, requirePermission('manage_quotations'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quotations WHERE id = ?').run(req.params.id);
  res.json({ message: 'Cotação excluída' });
});

module.exports = router;
