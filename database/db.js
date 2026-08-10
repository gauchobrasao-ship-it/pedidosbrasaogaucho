require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não configurada');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function initDatabase() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  if (!rows[0] || rows[0].ok !== 1) throw new Error('Verificação do banco falhou');
  console.log('Banco de dados (Supabase/Postgres) conectado via pg.');
}

function getDb() { return pool; }

module.exports = { getDb, initDatabase, withTransaction, pool };
