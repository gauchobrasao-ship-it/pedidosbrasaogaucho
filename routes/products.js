const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { search, category_id } = req.query;
  let query = `
    SELECT p.*, cat.name as category_name, cat.color as category_color,
           COUNT(DISTINCT cp.company_id) as company_count
    FROM products p
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN company_products cp ON cp.product_id = p.id AND cp.active = 1
    WHERE p.active = 1
  `;
  const params = [];
  if (search) {
    query += ' AND (p.name LIKE ? OR cat.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category_id) { query += ' AND p.category_id = ?'; params.push(category_id); }
  query += ' GROUP BY p.id ORDER BY cat.name, p.name';
  res.json(db.prepare(query).all(...params));
});

router.post('/', authMiddleware, requirePermission('manage_products'), (req, res) => {
  const { name, category_id, unit, brand } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const db = getDb();
  const result = db.prepare('INSERT INTO products (name, category_id, unit, brand) VALUES (?, ?, ?, ?)').run(name.trim(), category_id || null, unit || 'un', brand || null);
  res.json({ id: result.lastInsertRowid, name, category_id, unit: unit || 'un', brand: brand || null });
});

router.put('/:id', authMiddleware, requirePermission('manage_products'), (req, res) => {
  const { name, category_id, unit, brand } = req.body;
  const db = getDb();
  if (name !== undefined) db.prepare('UPDATE products SET name = ? WHERE id = ?').run(name, req.params.id);
  if (category_id !== undefined) db.prepare('UPDATE products SET category_id = ? WHERE id = ?').run(category_id, req.params.id);
  if (unit !== undefined) db.prepare('UPDATE products SET unit = ? WHERE id = ?').run(unit, req.params.id);
  if (brand !== undefined) db.prepare('UPDATE products SET brand = ? WHERE id = ?').run(brand || null, req.params.id);
  res.json({ message: 'Produto atualizado' });
});

router.delete('/:id', authMiddleware, requirePermission('manage_products'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Produto desativado' });
});

// Retorna vínculos por empresa+churrascaria para o produto
router.get('/:id/companies', authMiddleware, (req, res) => {
  const db = getDb();
  const links = db.prepare(`
    SELECT co.id as company_id, co.name as company_name,
           cp.churrascaria_id, ch.name as churrascaria_name,
           cp.price, cp.updated_at
    FROM company_products cp
    JOIN companies co ON co.id = cp.company_id
    JOIN churrascarias ch ON ch.id = cp.churrascaria_id
    WHERE cp.product_id = ? AND cp.active = 1 AND co.active = 1
    ORDER BY co.name, cp.churrascaria_id
  `).all(req.params.id);
  res.json(links);
});

module.exports = router;
