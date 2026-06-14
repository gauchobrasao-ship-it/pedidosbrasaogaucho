const express = require('express');
const { getDb, withTransaction } = require('../database/db');
const { authMiddleware, requirePermission, getAllowedChurrascarias } = require('../middleware/auth');
const { generateOrderPDF } = require('../utils/pdf');

const router = express.Router();

router.get('/', authMiddleware, requirePermission('view_orders'), (req, res) => {
  const db = getDb();
  const { churrascaria_id, company_id, from, to } = req.query;
  let query = `
    SELECT o.*, ch.name as churrascaria_name, c.name as company_name, u.name as user_name
    FROM orders o
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    JOIN companies c ON c.id = o.company_id
    JOIN users u ON u.id = o.user_id
    WHERE 1=1
  `;
  const params = [];
  if (churrascaria_id) { query += ' AND o.churrascaria_id = ?'; params.push(churrascaria_id); }
  if (company_id) { query += ' AND o.company_id = ?'; params.push(company_id); }
  if (from) { query += ' AND DATE(o.created_at) >= ?'; params.push(from); }
  if (to) { query += ' AND DATE(o.created_at) <= ?'; params.push(to); }
  const allowed = getAllowedChurrascarias(req.user);
  if (allowed) { query += ` AND o.churrascaria_id IN (${allowed.map(() => '?').join(',')})`; params.push(...allowed); }
  query += ' ORDER BY o.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', authMiddleware, requirePermission('view_orders'), (req, res) => {
  const db = getDb();
  const allowed = getAllowedChurrascarias(req.user);
  const extra = allowed ? ` AND o.churrascaria_id IN (${allowed.map(() => '?').join(',')})` : '';
  const order = db.prepare(`
    SELECT o.*, ch.name as churrascaria_name, ch.address as churrascaria_address,
           ch.phone as churrascaria_phone, ch.cnpj as churrascaria_cnpj,
           c.name as company_name, c.cnpj as company_cnpj, c.phone as company_phone,
           c.email as company_email, c.address as company_address, c.contact_name as company_contact,
           u.name as user_name
    FROM orders o
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    JOIN companies c ON c.id = o.company_id
    JOIN users u ON u.id = o.user_id
    WHERE o.id = ?${extra}
  `).get(req.params.id, ...(allowed || []));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  order.items = db.prepare(`
    SELECT oi.*, p.name as product_name, p.unit, cat.name as category_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE oi.order_id = ?
    ORDER BY cat.name, p.name
  `).all(req.params.id);

  res.json(order);
});

router.post('/', authMiddleware, requirePermission('create_orders'), (req, res) => {
  const { churrascaria_id, company_id, items, observations } = req.body;
  if (!churrascaria_id || !company_id) return res.status(400).json({ error: 'Churrascaria e empresa são obrigatórios' });

  const validItems = (items || []).filter(i => i.quantity && parseFloat(i.quantity) > 0);
  if (validItems.length === 0) return res.status(400).json({ error: 'Adicione pelo menos um produto com quantidade' });

  const db = getDb();
  const total = validItems.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.unit_price || 0)), 0);

  const orderId = withTransaction(db, () => {
    const result = db.prepare(
      'INSERT INTO orders (churrascaria_id, company_id, user_id, observations, total) VALUES (?, ?, ?, ?, ?)'
    ).run(churrascaria_id, company_id, req.user.id, observations || null, total);
    const id = Number(result.lastInsertRowid);
    for (const item of validItems) {
      const qty = parseFloat(item.quantity);
      const price = parseFloat(item.unit_price || 0);
      db.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)')
        .run(id, item.product_id, qty, price, qty * price);
      if (price > 0) {
        db.prepare('UPDATE company_products SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE churrascaria_id = ? AND company_id = ? AND product_id = ?')
          .run(price, churrascaria_id, company_id, item.product_id);
      }
    }
    return id;
  });

  res.json({ id: orderId, message: 'Pedido criado com sucesso' });
});

router.delete('/:id', authMiddleware, requirePermission('view_orders'), (req, res) => {
  const db = getDb();
  const allowed = getAllowedChurrascarias(req.user);
  const extra = allowed ? ` AND churrascaria_id IN (${allowed.map(() => '?').join(',')})` : '';
  const order = db.prepare(`SELECT id FROM orders WHERE id = ?${extra}`).get(req.params.id, ...(allowed || []));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Pedido excluído' });
});

router.get('/:id/pdf', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authMiddleware, requirePermission('view_orders'), async (req, res) => {
  const db = getDb();
  const allowed = getAllowedChurrascarias(req.user);
  const extra = allowed ? ` AND o.churrascaria_id IN (${allowed.map(() => '?').join(',')})` : '';
  const order = db.prepare(`
    SELECT o.*, ch.name as churrascaria_name, ch.address as churrascaria_address,
           ch.phone as churrascaria_phone, ch.cnpj as churrascaria_cnpj,
           c.name as company_name, c.cnpj as company_cnpj, c.phone as company_phone,
           c.email as company_email, c.address as company_address, c.contact_name as company_contact,
           u.name as user_name
    FROM orders o
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    JOIN companies c ON c.id = o.company_id
    JOIN users u ON u.id = o.user_id
    WHERE o.id = ?${extra}
  `).get(req.params.id, ...(allowed || []));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  order.items = db.prepare(`
    SELECT oi.*, p.name as product_name, p.unit, cat.name as category_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    WHERE oi.order_id = ?
    ORDER BY cat.name, p.name
  `).all(req.params.id);

  try {
    const pdfBuffer = await generateOrderPDF(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=pedido-${String(order.id).padStart(6,'0')}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar PDF' });
  }
});

module.exports = router;
