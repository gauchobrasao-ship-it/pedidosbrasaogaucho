const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Lista todas as contagens
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sl.id, sl.filter_type, sl.filter_label, sl.notes, sl.created_at, sl.updated_at,
             u.name as created_by_name,
             COUNT(sli.id)::int as item_count,
             COUNT(sli.id) FILTER (WHERE sli.quantity IS NOT NULL)::int as filled_count
      FROM stock_lists sl
      LEFT JOIN users u ON u.id = sl.created_by
      LEFT JOIN stock_list_items sli ON sli.stock_list_id = sl.id
      GROUP BY sl.id, u.name
      ORDER BY sl.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retorna uma lista com seus itens
router.get('/:id', async (req, res) => {
  try {
    const { rows: lists } = await pool.query(
      `SELECT sl.*, u.name as created_by_name
       FROM stock_lists sl
       LEFT JOIN users u ON u.id = sl.created_by
       WHERE sl.id = $1`,
      [req.params.id]
    );
    if (!lists[0]) return res.status(404).json({ error: 'Lista não encontrada' });

    const { rows: items } = await pool.query(`
      SELECT sli.id, sli.product_id, sli.quantity, sli.notes,
             p.name as product_name, p.unit,
             cat.name as category_name, cat.color as category_color
      FROM stock_list_items sli
      JOIN products p ON p.id = sli.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE sli.stock_list_id = $1
      ORDER BY cat.name NULLS LAST, p.name
    `, [req.params.id]);

    res.json({ ...lists[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cria uma nova lista de contagem
router.post('/', async (req, res) => {
  const { filter_type, company_id, category_ids, notes } = req.body;

  try {
    let filter_label = '';
    let products = [];

    if (filter_type === 'company') {
      const { rows: comp } = await pool.query('SELECT name FROM companies WHERE id = $1', [company_id]);
      filter_label = comp[0]?.name || '';
      const { rows } = await pool.query(`
        SELECT DISTINCT p.id FROM products p
        JOIN company_products cp ON cp.product_id = p.id
        WHERE cp.company_id = $1 AND cp.active = 1 AND p.active = 1
        ORDER BY p.id
      `, [company_id]);
      products = rows;
    } else {
      const catIds = (category_ids || []).map(Number).filter(Boolean);
      if (catIds.length) {
        const { rows: cats } = await pool.query(
          'SELECT name FROM categories WHERE id = ANY($1::int[]) ORDER BY name',
          [catIds]
        );
        filter_label = cats.map(c => c.name).join(', ');
        const { rows } = await pool.query(
          'SELECT id FROM products WHERE category_id = ANY($1::int[]) AND active = 1 ORDER BY name',
          [catIds]
        );
        products = rows;
      } else {
        filter_label = 'Todos os produtos';
        const { rows } = await pool.query('SELECT id FROM products WHERE active = 1 ORDER BY name');
        products = rows;
      }
    }

    const { rows: created } = await pool.query(
      `INSERT INTO stock_lists (filter_type, filter_label, company_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [filter_type, filter_label, company_id || null, notes || null, req.user.id]
    );
    const listId = created[0].id;

    for (const p of products) {
      await pool.query(
        'INSERT INTO stock_list_items (stock_list_id, product_id) VALUES ($1, $2)',
        [listId, p.id]
      );
    }

    res.json({ id: listId, item_count: products.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Salva as quantidades dos itens
router.put('/:id/items', async (req, res) => {
  const { items } = req.body;
  try {
    for (const item of items) {
      await pool.query(
        `UPDATE stock_list_items SET quantity = $1, notes = $2
         WHERE stock_list_id = $3 AND product_id = $4`,
        [item.quantity ?? null, item.notes || null, req.params.id, item.product_id]
      );
    }
    await pool.query('UPDATE stock_lists SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exclui uma lista
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM stock_lists WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
