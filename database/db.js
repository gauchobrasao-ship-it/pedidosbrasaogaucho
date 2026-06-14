const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'brasao.db');

let db;

function getDb() {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

function withTransaction(database, fn) {
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    database.exec('ROLLBACK');
    throw err;
  }
}

function initDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS churrascarias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      cnpj TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      permissions TEXT DEFAULT '{"manage_companies":false,"manage_products":false,"manage_categories":false,"create_orders":true,"view_orders":true,"view_reports":false,"manage_users":false,"manage_quotations":false}',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#E07820',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cnpj TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      contact_name TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER,
      unit TEXT DEFAULT 'un',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS company_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      churrascaria_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      price REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (churrascaria_id) REFERENCES churrascarias(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(churrascaria_id, company_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      churrascaria_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      observations TEXT,
      total REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (churrascaria_id) REFERENCES churrascarias(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      churrascaria_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      week_reference TEXT,
      observations TEXT,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (churrascaria_id) REFERENCES churrascarias(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      previous_price REAL DEFAULT 0,
      new_price REAL DEFAULT 0,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Migração: adiciona churrascaria_id em company_products se ainda não existir
  const cpCols = database.prepare('PRAGMA table_info(company_products)').all();
  if (!cpCols.some(c => c.name === 'churrascaria_id')) {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec(`
      CREATE TABLE company_products_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        churrascaria_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        price REAL DEFAULT 0,
        active INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(churrascaria_id, company_id, product_id)
      );
      INSERT INTO company_products_v2 (churrascaria_id, company_id, product_id, price, active, updated_at)
      SELECT ch.id, cp.company_id, cp.product_id, cp.price, cp.active, cp.updated_at
      FROM company_products cp CROSS JOIN churrascarias ch;
      DROP TABLE company_products;
      ALTER TABLE company_products_v2 RENAME TO company_products;
    `);
    database.exec('PRAGMA foreign_keys = ON');
    console.log('Migração: company_products atualizado com churrascaria_id.');
  }

  // Migração: adiciona brand em products
  const prodCols = database.prepare('PRAGMA table_info(products)').all();
  if (!prodCols.some(c => c.name === 'brand')) {
    database.exec('ALTER TABLE products ADD COLUMN brand TEXT');
    console.log('Migração: products.brand adicionado.');
  }

  // Migração: tabelas de solicitação de cotação
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!tables.includes('price_requests')) {
    database.exec(`
      CREATE TABLE price_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        churrascaria_id INTEGER NOT NULL,
        company_id INTEGER NOT NULL,
        title TEXT,
        created_by INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        last_filled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE price_request_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL,
        FOREIGN KEY (request_id) REFERENCES price_requests(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
    `);
    console.log('Migração: tabelas price_requests criadas.');
  }

  const churrCount = database.prepare('SELECT COUNT(*) as cnt FROM churrascarias').get();
  if (!churrCount.cnt) {
    database.prepare('INSERT INTO churrascarias (name) VALUES (?)').run('Brasão Gaúcho 1');
    database.prepare('INSERT INTO churrascarias (name) VALUES (?)').run('Brasão Gaúcho 2');
  }

  const userCount = database.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (!userCount.cnt) {
    const hash = bcrypt.hashSync('admin123', 10);
    const allPerms = JSON.stringify({
      manage_companies: true, manage_products: true, manage_categories: true,
      create_orders: true, view_orders: true, view_reports: true,
      manage_users: true, manage_quotations: true
    });
    database.prepare(
      `INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, 'admin', ?)`
    ).run('Administrador', 'admin@brasao.com', hash, allPerms);
  }

  console.log('Banco de dados inicializado.');
}

module.exports = { getDb, initDatabase, withTransaction };
