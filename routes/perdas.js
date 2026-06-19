const express = require('express');
const { pool } = require('../database/db');
const { authMiddleware, getAllowedChurrascarias } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  const { from, to, churrascaria_id } = req.query;
  const params = [];
  let query = `
    SELECT pe.id, pe.data, pe.funcionario, pe.produto, pe.quantidade, pe.motivo, pe.created_at,
           ch.name as churrascaria_name,
           u.name as created_by_name
    FROM perdas pe
    LEFT JOIN churrascarias ch ON ch.id = pe.churrascaria_id
    LEFT JOIN users u ON u.id = pe.created_by
    WHERE 1=1
  `;
  if (from)            { params.push(from);            query += ` AND pe.data >= $${params.length}`; }
  if (to)              { params.push(to);              query += ` AND pe.data <= $${params.length}`; }
  if (churrascaria_id) { params.push(churrascaria_id); query += ` AND pe.churrascaria_id = $${params.length}`; }
const allowed = getAllowedChurrascarias(req.user);
  if (allowed) { params.push(allowed); query += ` AND pe.churrascaria_id = ANY($${params.length}::int[])`; }
  query += ' ORDER BY pe.data DESC, pe.created_at DESC LIMIT 500';
  try {
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  const { data, funcionario, churrascaria_id, produto, quantidade, motivo } = req.body;
  if (!data || !funcionario?.trim() || !produto?.trim() || !quantidade) {
    return res.status(400).json({ error: 'Data, funcionário, produto e quantidade são obrigatórios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO perdas (data, funcionario, churrascaria_id, produto, quantidade, motivo, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [data, funcionario.trim(), churrascaria_id || null, produto.trim(), quantidade, motivo?.trim() || null, req.user.id]
    );
    res.json({ id: rows[0].id, message: 'Perda registrada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM perdas WHERE id = $1', [req.params.id]);
    res.json({ message: 'Registro excluído' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
