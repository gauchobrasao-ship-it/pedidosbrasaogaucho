const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { search } = req.query;
  let query = `
    SELECT c.*, COUNT(DISTINCT cp.product_id) as product_count
    FROM companies c
    LEFT JOIN company_products cp ON cp.company_id = c.id AND cp.active = 1
    WHERE c.active = 1
  `;
  const params = [];
  if (search) { query += ' AND c.name LIKE ?'; params.push(`%${search}%`); }
  query += ' GROUP BY c.id ORDER BY c.name';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
  res.json(company);
});

router.get('/:id/products', authMiddleware, (req, res) => {
  const db = getDb();
  const { churrascaria_id } = req.query;
  if (!churrascaria_id) return res.status(400).json({ error: 'churrascaria_id é obrigatório' });
  const products = db.prepare(`
    SELECT p.id, p.name, p.unit, c.name as category_name, c.color as category_color,
           cp.price, cp.updated_at
    FROM company_products cp
    JOIN products p ON p.id = cp.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE cp.company_id = ? AND cp.churrascaria_id = ? AND cp.active = 1 AND p.active = 1
    ORDER BY c.name, p.name
  `).all(req.params.id, churrascaria_id);
  res.json(products);
});

router.post('/', authMiddleware, requirePermission('manage_companies'), (req, res) => {
  const { name, cnpj, phone, email, address, contact_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO companies (name, cnpj, phone, email, address, contact_name) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name.trim(), cnpj || null, phone || null, email || null, address || null, contact_name || null);
  res.json({ id: result.lastInsertRowid, name });
});

router.put('/:id', authMiddleware, requirePermission('manage_companies'), (req, res) => {
  const { name, cnpj, phone, email, address, contact_name, active } = req.body;
  const db = getDb();
  if (name !== undefined) db.prepare('UPDATE companies SET name = ? WHERE id = ?').run(name, req.params.id);
  if (cnpj !== undefined) db.prepare('UPDATE companies SET cnpj = ? WHERE id = ?').run(cnpj, req.params.id);
  if (phone !== undefined) db.prepare('UPDATE companies SET phone = ? WHERE id = ?').run(phone, req.params.id);
  if (email !== undefined) db.prepare('UPDATE companies SET email = ? WHERE id = ?').run(email, req.params.id);
  if (address !== undefined) db.prepare('UPDATE companies SET address = ? WHERE id = ?').run(address, req.params.id);
  if (contact_name !== undefined) db.prepare('UPDATE companies SET contact_name = ? WHERE id = ?').run(contact_name, req.params.id);
  if (active !== undefined) db.prepare('UPDATE companies SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);
  res.json({ message: 'Empresa atualizada' });
});

router.delete('/:id', authMiddleware, requirePermission('manage_companies'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE companies SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Empresa desativada' });
});

router.post('/:id/products', authMiddleware, requirePermission('manage_companies'), (req, res) => {
  const { product_id, churrascaria_id, price } = req.body;
  if (!product_id || !churrascaria_id) return res.status(400).json({ error: 'product_id e churrascaria_id são obrigatórios' });
  const db = getDb();
  db.prepare(`
    INSERT INTO company_products (churrascaria_id, company_id, product_id, price, active)
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(churrascaria_id, company_id, product_id)
    DO UPDATE SET active=1, price=excluded.price, updated_at=CURRENT_TIMESTAMP
  `).run(churrascaria_id, req.params.id, product_id, price || 0);
  res.json({ message: 'Produto vinculado' });
});

router.put('/:id/products/:product_id', authMiddleware, requirePermission('manage_companies'), (req, res) => {
  const { price, churrascaria_id } = req.body;
  if (!churrascaria_id) return res.status(400).json({ error: 'churrascaria_id é obrigatório' });
  const db = getDb();
  db.prepare('UPDATE company_products SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE churrascaria_id = ? AND company_id = ? AND product_id = ?')
    .run(price || 0, churrascaria_id, req.params.id, req.params.product_id);
  res.json({ message: 'Preço atualizado' });
});

router.delete('/:id/products/:product_id', authMiddleware, requirePermission('manage_companies'), (req, res) => {
  const { churrascaria_id } = req.query;
  if (!churrascaria_id) return res.status(400).json({ error: 'churrascaria_id é obrigatório' });
  const db = getDb();
  db.prepare('UPDATE company_products SET active = 0 WHERE churrascaria_id = ? AND company_id = ? AND product_id = ?')
    .run(churrascaria_id, req.params.id, req.params.product_id);
  res.json({ message: 'Produto desvinculado' });
});

module.exports = router;
