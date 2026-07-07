const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../database/db');
const { authMiddleware, requirePermission, invalidateUserCache } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PERMS = {
  manage_companies: false, manage_products: false, manage_categories: false,
  create_orders: true, view_orders: true, view_reports: false,
  manage_users: false, manage_quotations: false,
  allowed_churrascarias: []
};

router.get('/', authMiddleware, requirePermission('manage_users'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email, role, permissions, active, created_at FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, requirePermission('manage_users'), async (req, res) => {
  const { name, email, password, role, permissions } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const perms = permissions || DEFAULT_PERMS;
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, permissions) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, email.toLowerCase(), hash, role || 'user', perms]
    );
    res.json({ id: rows[0].id, name, email, role: role || 'user' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email já cadastrado' });
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.put('/:id', authMiddleware, requirePermission('manage_users'), async (req, res) => {
  const { name, email, password, role, permissions, active } = req.body;
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (name !== undefined) await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.params.id]);
    if (email !== undefined) await pool.query('UPDATE users SET email = $1 WHERE id = $2', [email.toLowerCase(), req.params.id]);
    if (password) await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [bcrypt.hashSync(password, 10), req.params.id]);
    if (role) await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
    if (permissions !== undefined) await pool.query('UPDATE users SET permissions = $1 WHERE id = $2', [permissions, req.params.id]);
    if (active !== undefined) await pool.query('UPDATE users SET active = $1 WHERE id = $2', [active ? 1 : 0, req.params.id]);

    invalidateUserCache(req.params.id);
    res.json({ message: 'Usuário atualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authMiddleware, requirePermission('manage_users'), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Não pode desativar o próprio usuário' });
  try {
    await pool.query('UPDATE users SET active = 0 WHERE id = $1', [req.params.id]);
    invalidateUserCache(req.params.id);
    res.json({ message: 'Usuário desativado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
