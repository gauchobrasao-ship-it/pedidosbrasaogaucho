const express = require('express');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, (req, res) => {
  const { churrascaria_id, items } = req.body;
  if (!churrascaria_id || !items || items.length === 0) {
    return res.status(400).json({ error: 'Informe a churrascaria e os produtos' });
  }

  const db = getDb();
  const productIds = items.map(i => Number(i.product_id));
  const quantityMap = {};
  items.forEach(i => { quantityMap[Number(i.product_id)] = parseFloat(i.quantity) || 0; });

  const ph = productIds.map(() => '?').join(',');

  const productRows = db.prepare(`
    SELECT p.id, p.name, p.unit
    FROM products p
    WHERE p.id IN (${ph}) AND p.active = 1
  `).all(...productIds);

  const priceRows = db.prepare(`
    SELECT cp.company_id, c.name as company_name, cp.product_id, cp.price
    FROM company_products cp
    JOIN companies c ON c.id = cp.company_id
    WHERE cp.churrascaria_id = ? AND cp.product_id IN (${ph}) AND cp.active = 1 AND c.active = 1
    ORDER BY c.name
  `).all(churrascaria_id, ...productIds);

  const companiesMap = {};
  priceRows.forEach(row => {
    if (!companiesMap[row.company_id]) {
      companiesMap[row.company_id] = { id: row.company_id, name: row.company_name, prices: {} };
    }
    companiesMap[row.company_id].prices[row.product_id] = row.price;
  });

  const companies = Object.values(companiesMap).map(c => {
    let total = 0;
    let missingCount = 0;
    productRows.forEach(p => {
      const qty = quantityMap[p.id] || 0;
      const price = c.prices[p.id] || 0;
      if (price > 0) total += qty * price;
      else missingCount++;
    });
    return { ...c, total, missing_count: missingCount };
  }).sort((a, b) => {
    if (a.total === 0 && b.total > 0) return 1;
    if (b.total === 0 && a.total > 0) return -1;
    return a.total - b.total || a.name.localeCompare(b.name);
  });

  const products = productRows.map(p => ({ ...p, quantity: quantityMap[p.id] || 0 }));

  res.json({ products, companies });
});

module.exports = router;
