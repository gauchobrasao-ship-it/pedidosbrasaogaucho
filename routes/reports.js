const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware, requirePermission, getAllowedChurrascarias } = require('../middleware/auth');

const router = express.Router();

function churrSql(user) {
  const ids = getAllowedChurrascarias(user);
  if (!ids) return { sql: '', params: [] };
  return { sql: ` AND o.churrascaria_id IN (${ids.map(() => '?').join(',')})`, params: ids };
}

router.get('/churrascarias', authMiddleware, (req, res) => {
  const db = getDb();
  const ids = getAllowedChurrascarias(req.user);
  if (ids) {
    return res.json(db.prepare(
      `SELECT * FROM churrascarias WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY name`
    ).all(...ids));
  }
  res.json(db.prepare('SELECT * FROM churrascarias ORDER BY name').all());
});

router.get('/dashboard', authMiddleware, (req, res) => {
  const db = getDb();
  const cf = churrSql(req.user);
  const ids = getAllowedChurrascarias(req.user);

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];

  const todayStats = db.prepare(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE DATE(o.created_at)=?${cf.sql}`
  ).get(today, ...cf.params);

  const yesterdayStats = db.prepare(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE DATE(o.created_at)=?${cf.sql}`
  ).get(yesterday, ...cf.params);

  const monthStats = db.prepare(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total),0) as value FROM orders o WHERE DATE(o.created_at)>=?${cf.sql}`
  ).get(monthStart, ...cf.params);

  const last7 = db.prepare(
    `SELECT DATE(o.created_at) as date, COUNT(*) as orders, COALESCE(SUM(total),0) as value
     FROM orders o WHERE DATE(o.created_at)>=?${cf.sql}
     GROUP BY DATE(o.created_at) ORDER BY date`
  ).all(sevenDaysAgo, ...cf.params);

  const byChurrWhere = ids ? `WHERE ch.id IN (${ids.map(() => '?').join(',')})` : '';
  const byChurr = db.prepare(`
    SELECT ch.id, ch.name,
           COUNT(o.id) as orders, COALESCE(SUM(o.total),0) as value
    FROM churrascarias ch
    LEFT JOIN orders o ON o.churrascaria_id = ch.id
    ${byChurrWhere}
    GROUP BY ch.id ORDER BY ch.name
  `).all(...(ids || []));

  const recentOrders = db.prepare(`
    SELECT o.id, o.total, o.created_at,
           ch.name as churrascaria_name, c.name as company_name, u.name as user_name
    FROM orders o
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    JOIN companies c ON c.id = o.company_id
    JOIN users u ON u.id = o.user_id
    WHERE 1=1${cf.sql}
    ORDER BY o.created_at DESC LIMIT 8
  `).all(...cf.params);

  const companyCount = db.prepare('SELECT COUNT(*) as cnt FROM companies WHERE active=1').get().cnt;
  const productCount = db.prepare('SELECT COUNT(*) as cnt FROM products WHERE active=1').get().cnt;

  res.json({ todayStats, yesterdayStats, monthStats, last7, byChurr, recentOrders, companyCount, productCount });
});

router.get('/by-company', authMiddleware, requirePermission('view_reports'), (req, res) => {
  const db = getDb();
  const { churrascaria_id, from, to } = req.query;
  const cf = churrSql(req.user);
  let query = `
    SELECT c.name as company_name, ch.name as churrascaria_name,
           COUNT(DISTINCT o.id) as total_orders, SUM(o.total) as total_value,
           SUM(oi_count.item_count) as total_items
    FROM orders o
    JOIN companies c ON c.id = o.company_id
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    LEFT JOIN (SELECT order_id, COUNT(*) as item_count FROM order_items GROUP BY order_id) oi_count ON oi_count.order_id = o.id
    WHERE 1=1
  `;
  const params = [];
  if (churrascaria_id) { query += ' AND o.churrascaria_id = ?'; params.push(churrascaria_id); }
  if (from) { query += ' AND DATE(o.created_at) >= ?'; params.push(from); }
  if (to) { query += ' AND DATE(o.created_at) <= ?'; params.push(to); }
  query += cf.sql;
  params.push(...cf.params);
  query += ' GROUP BY c.id, ch.id ORDER BY total_value DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/by-product', authMiddleware, requirePermission('view_reports'), (req, res) => {
  const db = getDb();
  const { churrascaria_id, from, to, company_id } = req.query;
  const cf = churrSql(req.user);
  let query = `
    SELECT p.name as product_name, p.unit, cat.name as category_name,
           c.name as company_name, ch.name as churrascaria_name,
           SUM(oi.quantity) as total_quantity, SUM(oi.subtotal) as total_value,
           AVG(oi.unit_price) as avg_price, COUNT(*) as order_count
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    JOIN orders o ON o.id = oi.order_id
    JOIN companies c ON c.id = o.company_id
    JOIN churrascarias ch ON ch.id = o.churrascaria_id
    WHERE 1=1
  `;
  const params = [];
  if (churrascaria_id) { query += ' AND o.churrascaria_id = ?'; params.push(churrascaria_id); }
  if (company_id) { query += ' AND o.company_id = ?'; params.push(company_id); }
  if (from) { query += ' AND DATE(o.created_at) >= ?'; params.push(from); }
  if (to) { query += ' AND DATE(o.created_at) <= ?'; params.push(to); }
  query += cf.sql;
  params.push(...cf.params);
  query += ' GROUP BY p.id, c.id, ch.id ORDER BY total_value DESC';
  res.json(db.prepare(query).all(...params));
});

router.get('/summary', authMiddleware, requirePermission('view_reports'), (req, res) => {
  const db = getDb();
  const { churrascaria_id, from, to } = req.query;
  const cf = churrSql(req.user);
  const params = [];
  let where = '1=1';
  if (churrascaria_id) { where += ' AND o.churrascaria_id = ?'; params.push(churrascaria_id); }
  if (from) { where += ' AND DATE(o.created_at) >= ?'; params.push(from); }
  if (to) { where += ' AND DATE(o.created_at) <= ?'; params.push(to); }
  where += cf.sql.replace(/^ AND /, ' AND ');
  params.push(...cf.params);

  const totals = db.prepare(`SELECT COUNT(*) as orders, SUM(total) as value FROM orders o WHERE ${where}`).get(...params);
  const byChurr = db.prepare(`
    SELECT ch.name, COUNT(*) as orders, SUM(o.total) as value
    FROM orders o JOIN churrascarias ch ON ch.id = o.churrascaria_id
    WHERE ${where} GROUP BY ch.id
  `).all(...params);

  res.json({ totals, byChurrascaria: byChurr });
});

module.exports = router;
