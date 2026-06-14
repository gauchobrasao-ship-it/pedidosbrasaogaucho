require('dotenv').config();
const https = require('https');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'jrputgthwdhwvybllajg';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

function escapeLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') {
    if (!isFinite(val)) throw new Error(`Valor numérico inválido: ${val}`);
    return String(val);
  }
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return "ARRAY[]::int[]";
    const items = val.map(v => {
      if (typeof v === 'number') return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    return `ARRAY[${items.join(',')}]`;
  }
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

function interpolate(text, values) {
  if (!values || values.length === 0) return text;
  return text.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10) - 1;
    if (idx >= values.length) throw new Error(`Parâmetro $${n} não fornecido`);
    return escapeLiteral(values[idx]);
  });
}

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (!data || data.trim() === '') {
          return resolve({ rows: [], rowCount: 0 });
        }
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const msg = parsed.message || parsed.error || data;
            const err = new Error(msg);
            err.code = parsed.code || String(res.statusCode);
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Falha ao parsear resposta: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function normalizeResult(raw) {
  if (raw === null || raw === undefined) return { rows: [], rowCount: 0 };
  if (Array.isArray(raw)) return { rows: raw, rowCount: raw.length };
  if (typeof raw === 'object' && Object.keys(raw).length > 0) return { rows: [raw], rowCount: 1 };
  return { rows: [], rowCount: 0 };
}

const pool = {
  async query(text, values) {
    const sql = interpolate(text, values);
    const raw = await runQuery(sql);
    return normalizeResult(raw);
  },
};

async function withTransaction(fn) {
  const client = {
    query: (text, values) => pool.query(text, values),
  };
  return fn(client);
}

async function initDatabase() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  if (!rows[0] || rows[0].ok !== 1) throw new Error('Verificação do banco falhou');
  console.log('Banco de dados (Supabase) conectado via API.');
}

function getDb() { return pool; }

module.exports = { getDb, initDatabase, withTransaction, pool };
