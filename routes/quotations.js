const express = require('express');
const { pool, withTransaction } = require('../database/db');
const { authMiddleware, requirePermission, getAllowedChurrascarias } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, requirePermission('manage_quotations'), async (req, res) => {
  const { churrascaria_id, company_id } = req.query;
  const params = [];
  let query = `
    SELECT q.*, ch.name as churrascaria_name, c.name as company_name, u.name as user_name,
           COUNT(qi.id)::int as item_count
    FROM quotations q
    JOIN churrascarias ch ON ch.id = q.churrascaria_id
    JOIN companies c ON c.id = q.company_id
    JOIN users u ON u.id = q.user_id
    LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
    WHERE 1=1
  `;
  if (churrascaria_id) { params.push(churrascaria_id); query += ` AND q.churrascaria_id = $${params.length}`; }
  if (company_id) { params.push(company_id); query += ` AND q.company_id = $${params.length}`; }
  const allowed = getAllowedChurrascarias(req.user);
  if (allowed) { params.push(allowed); query += ` AND q.churrascaria_id = ANY($${params.length}::int[])`; }
  query += ' GROUP BY q.id, ch.name, c.name, u.name ORDER BY q.created_at DESC';
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authMiddleware, requirePermission('manage_quotations'), async (req, res) => {
  const params = [req.params.id];
  let query = `
    SELECT q.*, ch.name as churrascaria_name, c.name as company_name, u.name as user_name
    FROM quotations q
    JOIN churrascarias ch ON ch.id = q.churrascaria_id
    JOIN companies c ON c.id = q.company_id
    JOIN users u ON u.id = q.user_id
    WHERE q.id = $1
  `;
  const allowed = getAllowedChurrascarias(req.user);
  if (allowed) { params.push(allowed); query += ` AND q.churrascaria_id = ANY($${params.length}::int[])`; }
  try {
    const { rows } = await pool.query(query, params);
    const quotation = rows[0];
    if (!quotation) return res.status(404).json({ error: 'Cotação não encontrada' });

    const { rows: items } = await pool.query(`
      SELECT qi.*, p.name as product_name, p.unit, cat.name as category_name
      FROM quotation_items qi
      JOIN products p ON p.id = qi.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE qi.quotation_id = $1
      ORDER BY cat.name, p.name
    `, [req.params.id]);

    quotation.items = items;
    res.json(quotation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, requirePermission('manage_quotations'), async (req, res) => {
  const { churrascaria_id, company_id, week_reference, observations, items } = req.body;
  if (!churrascaria_id || !company_id) return res.status(400).json({ error: 'Churrascaria e empresa são obrigatórios' });

  try {
    const quotationId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO quotations (churrascaria_id, company_id, user_id, week_reference, observations) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [churrascaria_id, company_id, req.user.id, week_reference || null, observations || null]
      );
      const id = rows[0].id;
      if (items && items.length > 0) {
        for (const item of items) {
          await client.query(
            'INSERT INTO quotation_items (quotation_id, product_id, previous_price, new_price) VALUES ($1,$2,$3,$4)',
            [id, item.product_id, item.previous_price || 0, item.new_price || 0]
          );
          await client.query(
            'UPDATE company_products SET price = $1, updated_at = NOW() WHERE churrascaria_id = $2 AND company_id = $3 AND product_id = $4',
            [item.new_price || 0, churrascaria_id, company_id, item.product_id]
          );
        }
      }
      return id;
    });
    res.json({ id: quotationId, message: 'Cotação salva e preços atualizados' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar cotação' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('manage_quotations'), async (req, res) => {
  try {
    await pool.query('DELETE FROM quotation_items WHERE quotation_id = $1', [req.params.id]);
    await pool.query('DELETE FROM quotations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Cotação excluída' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
