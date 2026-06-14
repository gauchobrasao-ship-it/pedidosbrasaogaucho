const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware, requirePermission, getAllowedChurrascarias } = require('../middleware/auth');

const router = express.Router();

function churrFilter(user, params) {
  const ids = getAllowedChurrascarias(user);
  if (!ids) return '';
  params.push(ids);
  return ` AND o.churrascaria_id = ANY($${params.length}::int[])`;
}

router.get('/churrascarias', authMiddleware, async (req, res) => {
  const ids = getAllowedChurrascarias(req.user);
  try {
    if (ids) {
      const { rows } = await pool.query('SELECT * FROM churrascarias WHERE id = ANY($1::int[]) ORDER BY name', [ids]);
      return res.json(rows);
    }
    const { rows } = await pool.query('SELECT * FROM churrascarias ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/dashboard', authMiddleware, async (req, res) => {
  const ids = getAllowedChurrascarias(req.user);

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];

  try {
    const cfParams = ids ? [ids] : [];
    const cfSql = ids ? ` AND o.churrascaria_id = ANY($${cfParams.length}::int[])` : '';

    const [todayStats, yesterdayStats, monthStats, last7, byChurr, recentOrders, companyCount, productCount] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE o.created_at::date=$1${cfSql}`, [today, ...cfParams]),
      pool.query(`SELECT COUNT(*)::int as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE o.created_at::date=$1${cfSql}`, [yesterday, ...cfParams]),
      pool.query(`SELECT COUNT(*)::int as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE o.created_at::date>=$1${cfSql}`, [monthStart, ...cfParams]),
      pool.query(`SELECT o.created_at::date as date, COUNT(*)::int as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE o.created_at::date>=$1${cfSql} GROUP BY o.created_at::date ORDER BY date`, [sevenDaysAgo, ...cfParams]),
      ids
        ? pool.query(`SELECT ch.id, ch.name, COUNT(o.id)::int as orders, COALESCE(SUM(o.total),0) as value FROM churrascarias ch LEFT JOIN orders o ON o.churrascaria_id = ch.id WHERE ch.id = ANY($1::int[]) GROUP BY ch.id ORDER BY ch.name`, [ids])
        : pool.query(`SELECT ch.id, ch.name, COUNT(o.id)::int as orders, COALESCE(SUM(o.total),0) as value FROM churrascarias ch LEFT JOIN orders o ON o.churrascaria_id = ch.id GROUP BY ch.id ORDER BY ch.name`),
      pool.query(`SELECT o.id, o.total, o.created_at, ch.name as churrascaria_name, c.name as company_name, u.name as user_name FROM orders o JOIN churrascarias ch ON ch.id = o.churrascaria_id JOIN companies c ON c.id = o.company_id JOIN users u ON u.id = o.user_id WHERE 1=1${cfSql} ORDER BY o.created_at DESC LIMIT 8`, cfParams),
      pool.query('SELECT COUNT(*)::int as cnt FROM companies WHERE active=1'),
      pool.query('SELECT COUNT(*)::int as cnt FROM products WHERE active=1'),
    ]);

    res.json({
      todayStats: todayStats.rows[0],
      yesterdayStats: yesterdayStats.rows[0],
      monthStats: monthStats.rows[0],
      last7: last7.rows,
      byChurr: byChurr.rows,
      recentOrders: recentOrders.rows,
      companyCount: companyCount.rows[0].cnt,
      productCount: productCount.rows[0].cnt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/by-company', authMiddleware, requirePermission('view_reports'), async (req, res) => {
  const { churrascaria_id, from, to } = req.query;
  const params = [];
  let query = `
    SELECT c.name as company_name, ch.name as churrascaria_name,
           COUNT(DISTINCT o.id)::int as total_orders, COALESCE(SUM(o.total),0) as total_value,
           COALESCE(SUM(oi_count.item_count),0)::int as total_items
    FROM orders o
    JOIN companies c ON c.id = o.company_id
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    LEFT JOIN (SELECT order_id, COUNT(*)::int as item_count FROM order_items GROUP BY order_id) oi_count ON oi_count.order_id = o.id
    WHERE 1=1
  `;
  if (churrascaria_id) { params.push(churrascaria_id); query += ` AND o.churrascaria_id = $${params.length}`; }
  if (from) { params.push(from); query += ` AND o.created_at::date >= $${params.length}`; }
  if (to) { params.push(to); query += ` AND o.created_at::date <= $${params.length}`; }
  query += churrFilter(req.user, params);
  query += ' GROUP BY c.id, c.name, ch.id, ch.name ORDER BY total_value DESC';
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/by-product', authMiddleware, requirePermission('view_reports'), async (req, res) => {
  const { churrascaria_id, from, to, company_id } = req.query;
  const params = [];
  let query = `
    SELECT p.name as product_name, p.unit, cat.name as category_name,
           c.name as company_name, ch.name as churrascaria_name,
           COALESCE(SUM(oi.quantity),0) as total_quantity, COALESCE(SUM(oi.subtotal),0) as total_value,
           COALESCE(AVG(oi.unit_price),0) as avg_price, COUNT(*)::int as order_count
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    JOIN orders o ON o.id = oi.order_id
    JOIN companies c ON c.id = o.company_id
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    WHERE 1=1
  `;
  if (churrascaria_id) { params.push(churrascaria_id); query += ` AND o.churrascaria_id = $${params.length}`; }
  if (company_id) { params.push(company_id); query += ` AND o.company_id = $${params.length}`; }
  if (from) { params.push(from); query += ` AND o.created_at::date >= $${params.length}`; }
  if (to) { params.push(to); query += ` AND o.created_at::date <= $${params.length}`; }
  query += churrFilter(req.user, params);
  query += ' GROUP BY p.id, p.name, p.unit, cat.name, c.id, c.name, ch.id, ch.name ORDER BY total_value DESC';
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/summary', authMiddleware, requirePermission('view_reports'), async (req, res) => {
  const { churrascaria_id, from, to } = req.query;
  const params = [];
  let where = '1=1';
  if (churrascaria_id) { params.push(churrascaria_id); where += ` AND o.churrascaria_id = $${params.length}`; }
  if (from) { params.push(from); where += ` AND o.created_at::date >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND o.created_at::date <= $${params.length}`; }
  const cfExtra = churrFilter(req.user, params);
  if (cfExtra) where += cfExtra.replace(/^ AND /, ' AND ');
  try {
    const [totals, byChurr] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE ${where}`, params),
      pool.query(`SELECT ch.name, COUNT(*)::int as orders, COALESCE(SUM(o.total),0) as value FROM orders o JOIN churrascarias ch ON ch.id = o.churrascaria_id WHERE ${where} GROUP BY ch.id, ch.name`, params),
    ]);
    res.json({ totals: totals.rows[0], byChurrascaria: byChurr.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
