const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(p.id)::int as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
      GROUP BY c.id ORDER BY c.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, requirePermission('manage_categories'), async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const { rows: dup } = await pool.query(
      'SELECT id FROM categories WHERE LOWER(name) = LOWER($1)', [name.trim()]
    );
    if (dup.length) return res.status(400).json({ error: 'Grupo já cadastrado com este nome' });
    const { rows } = await pool.query(
      'INSERT INTO categories (name, color) VALUES ($1, $2) RETURNING id',
      [name.trim(), color || '#E07820']
    );
    res.json({ id: rows[0].id, name, color: color || '#E07820' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar grupo' });
  }
});

router.put('/:id', authMiddleware, requirePermission('manage_categories'), async (req, res) => {
  const { name, color } = req.body;
  try {
    if (name) {
      const { rows: dup } = await pool.query(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id <> $2', [name.trim(), req.params.id]
      );
      if (dup.length) return res.status(400).json({ error: 'Grupo já cadastrado com este nome' });
      await pool.query('UPDATE categories SET name = $1 WHERE id = $2', [name.trim(), req.params.id]);
    }
    if (color) await pool.query('UPDATE categories SET color = $1 WHERE id = $2', [color, req.params.id]);
    res.json({ message: 'Categoria atualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('manage_categories'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int as count FROM products WHERE category_id = $1 AND active = 1',
      [req.params.id]
    );
    if (rows[0].count > 0) return res.status(400).json({ error: `Categoria em uso por ${rows[0].count} produto(s)` });
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Categoria excluída' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
