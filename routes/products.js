const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { search, category_id } = req.query;
  const params = [];
  let productFilter = 'WHERE p.active = 1';
  if (search) {
    params.push(`%${search}%`);
    productFilter += ` AND (p.name ILIKE $${params.length} OR cat.name ILIKE $${params.length})`;
  }
  if (category_id) {
    params.push(category_id);
    productFilter += ` AND p.category_id = $${params.length}`;
  }

  const query = `
    WITH active_prices AS (
      SELECT cp.product_id, cp.price, cp.bulk_price, cp.bulk_min_qty, cp.updated_at, co.name as company_name
      FROM company_products cp
      JOIN companies co ON co.id = cp.company_id AND co.active = 1
      WHERE cp.active = 1 AND cp.price > 0
    ),
    price_stats AS (
      SELECT product_id,
             COUNT(DISTINCT company_name)::int as company_count,
             MIN(price) as min_price,
             array_agg(DISTINCT company_name ORDER BY company_name) as company_names
      FROM active_prices
      GROUP BY product_id
    ),
    min_price_row AS (
      SELECT DISTINCT ON (product_id)
             product_id, company_name as min_price_company, updated_at as min_price_updated_at,
             bulk_price as min_bulk_price, bulk_min_qty as min_bulk_min_qty
      FROM active_prices
      ORDER BY product_id, price ASC
    )
    SELECT p.id, p.name, p.brand, p.unit, p.category_id,
           cat.name as category_name, cat.color as category_color,
           COALESCE(ps.company_count, 0) as company_count,
           ps.min_price, ps.company_names,
           mr.min_price_company, mr.min_price_updated_at,
           mr.min_bulk_price, mr.min_bulk_min_qty
    FROM products p
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN price_stats ps ON ps.product_id = p.id
    LEFT JOIN min_price_row mr ON mr.product_id = p.id
    ${productFilter}
    ORDER BY p.name
  `;
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, requirePermission('manage_products'), async (req, res) => {
  const { name, category_id, unit, brand } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const { rows: dup } = await pool.query(
      'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND active = 1', [name.trim()]
    );
    if (dup.length) return res.status(400).json({ error: 'Produto já cadastrado com este nome' });
    const { rows } = await pool.query(
      'INSERT INTO products (name, category_id, unit, brand) VALUES ($1, $2, $3, $4) RETURNING id',
      [name.trim(), category_id || null, unit || 'un', brand || null]
    );
    res.json({ id: rows[0].id, name, category_id, unit: unit || 'un', brand: brand || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authMiddleware, requirePermission('manage_products'), async (req, res) => {
  const { name, category_id, unit, brand } = req.body;
  try {
    if (name !== undefined) {
      const { rows: dup } = await pool.query(
        'SELECT id FROM products WHERE LOWER(name) = LOWER($1) AND active = 1 AND id <> $2', [name.trim(), req.params.id]
      );
      if (dup.length) return res.status(400).json({ error: 'Produto já cadastrado com este nome' });
      await pool.query('UPDATE products SET name = $1 WHERE id = $2', [name, req.params.id]);
    }
    if (category_id !== undefined) await pool.query('UPDATE products SET category_id = $1 WHERE id = $2', [category_id, req.params.id]);
    if (unit !== undefined) await pool.query('UPDATE products SET unit = $1 WHERE id = $2', [unit, req.params.id]);
    if (brand !== undefined) await pool.query('UPDATE products SET brand = $1 WHERE id = $2', [brand || null, req.params.id]);
    res.json({ message: 'Produto atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('manage_products'), async (req, res) => {
  try {
    await pool.query('UPDATE products SET active = 0 WHERE id = $1', [req.params.id]);
    res.json({ message: 'Produto desativado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, cat.name as category_name, cat.color as category_color
       FROM products p
       LEFT JOIN categories cat ON cat.id = p.category_id
       WHERE p.id = $1 AND p.active = 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id/companies', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT co.id as company_id, co.name as company_name,
             cp.churrascaria_id, ch.name as churrascaria_name,
             cp.price, cp.updated_at
      FROM company_products cp
      JOIN companies co ON co.id = cp.company_id
      JOIN churrascarias ch ON ch.id = cp.churrascaria_id
      WHERE cp.product_id = $1 AND cp.active = 1 AND co.active = 1
      ORDER BY co.name, cp.churrascaria_id
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/companies/batch', authMiddleware, requirePermission('manage_products'), async (req, res) => {
  const productId = req.params.id;
  const { links = [], unlinks = [] } = req.body;
  try {
    const ops = [];
    for (const { company_id, churrascaria_id, price } of links) {
      ops.push(pool.query(`
        INSERT INTO company_products (churrascaria_id, company_id, product_id, price, active)
        VALUES ($1, $2, $3, $4, 1)
        ON CONFLICT (churrascaria_id, company_id, product_id)
        DO UPDATE SET active=1, price=EXCLUDED.price, updated_at=NOW()
      `, [churrascaria_id, company_id, productId, price || 0]));
    }
    for (const { company_id, churrascaria_id } of unlinks) {
      ops.push(pool.query(
        'UPDATE company_products SET active=0 WHERE churrascaria_id=$1 AND company_id=$2 AND product_id=$3',
        [churrascaria_id, company_id, productId]
      ));
    }
    await Promise.all(ops);
    res.json({ message: 'Vínculos atualizados' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
