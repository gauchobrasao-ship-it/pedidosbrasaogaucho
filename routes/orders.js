const express = require('express');
const { pool, withTransaction } = require('../database/db');
const { authMiddleware, requirePermission, getAllowedChurrascarias } = require('../middleware/auth');
const { generateOrderPDF } = require('../utils/pdf');

const router = express.Router();

function buildChurrFilter(user, params) {
  const allowed = getAllowedChurrascarias(user);
  if (!allowed) return '';
  params.push(allowed);
  return ` AND o.churrascaria_id = ANY($${params.length}::int[])`;
}

router.get('/', authMiddleware, requirePermission('view_orders'), async (req, res) => {
  const { churrascaria_id, company_id, from, to } = req.query;
  const params = [];
  let query = `
    SELECT o.*, ch.name as churrascaria_name, c.name as company_name, u.name as user_name
    FROM orders o
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    JOIN companies c ON c.id = o.company_id
    JOIN users u ON u.id = o.user_id
    WHERE 1=1
  `;
  if (churrascaria_id) { params.push(churrascaria_id); query += ` AND o.churrascaria_id = $${params.length}`; }
  if (company_id) { params.push(company_id); query += ` AND o.company_id = $${params.length}`; }
  if (from) { params.push(from); query += ` AND o.created_at::date >= $${params.length}`; }
  if (to) { params.push(to); query += ` AND o.created_at::date <= $${params.length}`; }
  query += buildChurrFilter(req.user, params);
  query += ' ORDER BY o.created_at DESC';
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id', authMiddleware, requirePermission('view_orders'), async (req, res) => {
  const params = [req.params.id];
  let query = `
    SELECT o.*, ch.name as churrascaria_name, ch.address as churrascaria_address,
           ch.phone as churrascaria_phone, ch.cnpj as churrascaria_cnpj,
           c.name as company_name, c.cnpj as company_cnpj, c.phone as company_phone,
           c.email as company_email, c.address as company_address, c.contact_name as company_contact,
           u.name as user_name
    FROM orders o
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    JOIN companies c ON c.id = o.company_id
    JOIN users u ON u.id = o.user_id
    WHERE o.id = $1
  `;
  query += buildChurrFilter(req.user, params);
  try {
    const { rows } = await pool.query(query, params);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const { rows: items } = await pool.query(`
      SELECT oi.*, p.name as product_name, p.unit, cat.name as category_name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE oi.order_id = $1
      ORDER BY cat.name, p.name
    `, [req.params.id]);

    order.items = items;
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, requirePermission('create_orders'), async (req, res) => {
  const { churrascaria_id, company_id, items, observations } = req.body;
  if (!churrascaria_id || !company_id) return res.status(400).json({ error: 'Churrascaria e empresa são obrigatórios' });

  const validItems = (items || []).filter(i => i.quantity && parseFloat(i.quantity) > 0);
  if (validItems.length === 0) return res.status(400).json({ error: 'Adicione pelo menos um produto com quantidade' });

  const total = validItems.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.unit_price || 0)), 0);

  try {
    const orderId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO orders (churrascaria_id, company_id, user_id, observations, total) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [churrascaria_id, company_id, req.user.id, observations || null, total]
      );
      const id = rows[0].id;
      for (const item of validItems) {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unit_price || 0);
        await client.query(
          'INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES ($1,$2,$3,$4,$5)',
          [id, item.product_id, qty, price, qty * price]
        );
        if (price > 0) {
          await client.query(
            'UPDATE company_products SET price = $1, updated_at = NOW() WHERE churrascaria_id = $2 AND company_id = $3 AND product_id = $4',
            [price, churrascaria_id, company_id, item.product_id]
          );
        }
      }
      return id;
    });
    res.json({ id: orderId, message: 'Pedido criado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('view_orders'), async (req, res) => {
  const params = [req.params.id];
  let checkQuery = 'SELECT id FROM orders WHERE id = $1';
  checkQuery += buildChurrFilter(req.user, params);
  try {
    const { rows } = await pool.query(checkQuery, params);
    if (!rows[0]) return res.status(404).json({ error: 'Pedido não encontrado' });
    await pool.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ message: 'Pedido excluído' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.*, ch.name as churrascaria_name, ch.address as churrascaria_address,
             ch.phone as churrascaria_phone, ch.cnpj as churrascaria_cnpj,
             c.name as company_name, c.cnpj as company_cnpj, c.phone as company_phone,
             c.email as company_email, c.address as company_address, c.contact_name as company_contact,
             u.name as user_name
      FROM orders o
      JOIN churrascarias ch ON ch.id = o.churrascaria_id
      JOIN companies c ON c.id = o.company_id
      JOIN users u ON u.id = o.user_id
      WHERE o.id = $1
    `, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const { rows: items } = await pool.query(`
      SELECT oi.*, p.name as product_name, p.unit, cat.name as category_name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE oi.order_id = $1
      ORDER BY cat.name, p.name
    `, [req.params.id]);

    order.items = items;
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
