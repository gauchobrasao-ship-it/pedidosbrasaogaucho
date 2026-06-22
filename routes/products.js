const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { search, category_id } = req.query;
  const params = [];
  let query = `
    SELECT p.*, cat.name as category_name, cat.color as category_color,
           COUNT(DISTINCT cp.company_id)::int as company_count,
           MIN(cp.price) as min_price,
           (
             SELECT co.name FROM company_products cp2
             JOIN companies co ON co.id = cp2.company_id
             WHERE cp2.product_id = p.id AND cp2.active = 1 AND co.active = 1
             ORDER BY cp2.price ASC LIMIT 1
           ) as min_price_company,
           (
             SELECT cp2.updated_at FROM company_products cp2
             JOIN companies co ON co.id = cp2.company_id
             WHERE cp2.product_id = p.id AND cp2.active = 1 AND co.active = 1
             ORDER BY cp2.price ASC LIMIT 1
           ) as min_price_updated_at,
           (
             SELECT array_agg(name ORDER BY name)
             FROM (
               SELECT DISTINCT co.name
               FROM company_products cp2
               JOIN companies co ON co.id = cp2.company_id
               WHERE cp2.product_id = p.id AND cp2.active = 1 AND co.active = 1
             ) sub
           ) as company_names
    FROM products p
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN company_products cp ON cp.product_id = p.id AND cp.active = 1
    WHERE p.active = 1
  `;
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (p.name ILIKE $${params.length} OR cat.name ILIKE $${params.length})`;
  }
  if (category_id) {
    params.push(category_id);
    query += ` AND p.category_id = $${params.length}`;
  }
  query += ' GROUP BY p.id, cat.name, cat.color ORDER BY p.name';
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
