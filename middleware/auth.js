const jwt = require('jsonwebtoken');
const { pool } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'brasao-gaucho-secret-2024';

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND active = 1', [decoded.id]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    user.permissions = user.permissions || {};
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (!req.user.permissions[permission]) {
      return res.status(403).json({ error: 'Sem permissão para esta ação' });
    }
    next();
  };
}

function getAllowedChurrascarias(user) {
  if (user.role === 'admin') return null;
  const ids = user.permissions && user.permissions.allowed_churrascarias;
  if (!ids || ids.length === 0) return null;
  return ids.map(Number);
}

module.exports = { authMiddleware, requirePermission, JWT_SECRET, getAllowedChurrascarias };
