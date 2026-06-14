const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const cats = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json(cats);
});

router.post('/', authMiddleware, requirePermission('manage_categories'), (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const db = getDb();
  try {
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(name.trim(), color || '#E07820');
    res.json({ id: result.lastInsertRowid, name, color: color || '#E07820' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Categoria já existe' });
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

router.put('/:id', authMiddleware, requirePermission('manage_categories'), (req, res) => {
  const { name, color } = req.body;
  const db = getDb();
  if (name) db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (color) db.prepare('UPDATE categories SET color = ? WHERE id = ?').run(color, req.params.id);
  res.json({ message: 'Categoria atualizada' });
});

router.delete('/:id', authMiddleware, requirePermission('manage_categories'), (req, res) => {
  const db = getDb();
  const inUse = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ? AND active = 1').get(req.params.id);
  if (inUse.count > 0) return res.status(400).json({ error: `Categoria em uso por ${inUse.count} produto(s)` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Categoria excluída' });
});

module.exports = router;
