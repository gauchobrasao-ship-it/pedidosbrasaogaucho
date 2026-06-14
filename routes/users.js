const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { authMiddleware, requirePermission } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PERMS = {
  manage_companies: false, manage_products: false, manage_categories: false,
  create_orders: true, view_orders: true, view_reports: false,
  manage_users: false, manage_quotations: false,
  allowed_churrascarias: []
};

router.get('/', authMiddleware, requirePermission('manage_users'), (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, permissions, active, created_at FROM users ORDER BY name').all();
  users.forEach(u => { u.permissions = JSON.parse(u.permissions || '{}'); });
  res.json(users);
});

router.post('/', authMiddleware, requirePermission('manage_users'), (req, res) => {
  const { name, email, password, role, permissions } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });

  const db = getDb();
  const hash = bcrypt.hashSync(password, 10);
  const permsStr = JSON.stringify(permissions || DEFAULT_PERMS);

  try {
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email.toLowerCase(), hash, role || 'user', permsStr);
    res.json({ id: result.lastInsertRowid, name, email, role: role || 'user' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email já cadastrado' });
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.put('/:id', authMiddleware, requirePermission('manage_users'), (req, res) => {
  const { name, email, password, role, permissions, active } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.params.id);
  if (email) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email.toLowerCase(), req.params.id);
  if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (permissions !== undefined) db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(JSON.stringify(permissions), req.params.id);
  if (active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, req.params.id);

  res.json({ message: 'Usuário atualizado' });
});

router.delete('/:id', authMiddleware, requirePermission('manage_users'), (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Não pode desativar o próprio usuário' });
  const db = getDb();
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Usuário desativado' });
});

module.exports = router;
