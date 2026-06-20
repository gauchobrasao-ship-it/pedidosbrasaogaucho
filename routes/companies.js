const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { search } = req.query;
  const params = [];
  let query = `
    SELECT c.*, COUNT(DISTINCT cp.product_id)::int as product_count
    FROM companies c
    LEFT JOIN company_products cp ON cp.company_id = c.id AND cp.active = 1
    WHERE c.active = 1
  `;
  if (search) {
    params.push(`%${search}%`);
    query += ` AND c.name ILIKE $${params.length}`;
  }
  query += ' GROUP BY c.id ORDER BY c.name';
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id/products', authMiddleware, async (req, res) => {
  const { churrascaria_id } = req.query;
  if (!churrascaria_id) return res.status(400).json({ error: 'churrascaria_id é obrigatório' });
  try {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.unit, c.name as category_name, c.color as category_color,
             cp.price, cp.bulk_min_qty, cp.bulk_price, cp.updated_at
      FROM company_products cp
      JOIN products p ON p.id = cp.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE cp.company_id = $1 AND cp.churrascaria_id = $2 AND cp.active = 1 AND p.active = 1
      ORDER BY c.name, p.name
    `, [req.params.id, churrascaria_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, requirePermission('manage_companies'), async (req, res) => {
  const { name, cnpj, phone, email, address, contact_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO companies (name, cnpj, phone, email, address, contact_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [name.trim(), cnpj || null, phone || null, email || null, address || null, contact_name || null]
    );
    res.json({ id: rows[0].id, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id', authMiddleware, requirePermission('manage_companies'), async (req, res) => {
  const { name, cnpj, phone, email, address, contact_name, active } = req.body;
  try {
    if (name !== undefined) await pool.query('UPDATE companies SET name = $1 WHERE id = $2', [name, req.params.id]);
    if (cnpj !== undefined) await pool.query('UPDATE companies SET cnpj = $1 WHERE id = $2', [cnpj, req.params.id]);
    if (phone !== undefined) await pool.query('UPDATE companies SET phone = $1 WHERE id = $2', [phone, req.params.id]);
    if (email !== undefined) await pool.query('UPDATE companies SET email = $1 WHERE id = $2', [email, req.params.id]);
    if (address !== undefined) await pool.query('UPDATE companies SET address = $1 WHERE id = $2', [address, req.params.id]);
    if (contact_name !== undefined) await pool.query('UPDATE companies SET contact_name = $1 WHERE id = $2', [contact_name, req.params.id]);
    if (active !== undefined) await pool.query('UPDATE companies SET active = $1 WHERE id = $2', [active ? 1 : 0, req.params.id]);
    res.json({ message: 'Empresa atualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('manage_companies'), async (req, res) => {
  try {
    await pool.query('UPDATE companies SET active = 0 WHERE id = $1', [req.params.id]);
    res.json({ message: 'Empresa desativada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/:id/products', authMiddleware, requirePermission('manage_companies'), async (req, res) => {
  const { product_id, churrascaria_id, price } = req.body;
  if (!product_id || !churrascaria_id) return res.status(400).json({ error: 'product_id e churrascaria_id são obrigatórios' });
  try {
    await pool.query(`
      INSERT INTO company_products (churrascaria_id, company_id, product_id, price, active)
      VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT (churrascaria_id, company_id, product_id)
      DO UPDATE SET active=1, price=EXCLUDED.price, updated_at=NOW()
    `, [churrascaria_id, req.params.id, product_id, price || 0]);
    res.json({ message: 'Produto vinculado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.put('/:id/products/:product_id', authMiddleware, requirePermission('manage_companies'), async (req, res) => {
  const { price, churrascaria_id } = req.body;
  if (!churrascaria_id) return res.status(400).json({ error: 'churrascaria_id é obrigatório' });
  try {
    await pool.query(
      'UPDATE company_products SET price = $1, updated_at = NOW() WHERE churrascaria_id = $2 AND company_id = $3 AND product_id = $4',
      [price || 0, churrascaria_id, req.params.id, req.params.product_id]
    );
    res.json({ message: 'Preço atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id/products/:product_id', authMiddleware, requirePermission('manage_companies'), async (req, res) => {
  const { churrascaria_id } = req.query;
  if (!churrascaria_id) return res.status(400).json({ error: 'churrascaria_id é obrigatório' });
  try {
    await pool.query(
      'UPDATE company_products SET active = 0 WHERE churrascaria_id = $1 AND company_id = $2 AND product_id = $3',
      [churrascaria_id, req.params.id, req.params.product_id]
    );
    res.json({ message: 'Produto desvinculado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
