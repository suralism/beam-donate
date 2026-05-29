const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Initialize SQLite Database using built-in node:sqlite module, 
 * create tables, and handle legacy JSON migrations.
 */
function initDB() {
  const DB_DIR = path.join(__dirname, '../data');
  const DB_FILE = path.join(DB_DIR, 'database.db');

  // Ensure database directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  console.log(`⚙️ Opening SQLite database (using Node.js built-in node:sqlite) at ${DB_FILE}...`);
  
  db = new DatabaseSync(DB_FILE);

  // 1. Create transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      donor TEXT DEFAULT 'Anonymous',
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      paymentUrl TEXT,
      raw_response TEXT,
      raw_webhook TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      paidAt TEXT
    )
  `);

  // 2. Create settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  console.log('✅ SQLite Tables verified.');

  // 3. Auto Migration of Legacy JSON files
  const LEGACY_DB_FILE = path.join(DB_DIR, 'transactions.json');
  const LEGACY_SETTINGS_FILE = path.join(DB_DIR, 'overlay-settings.json');

  let migratedTransactions = false;
  let migratedSettings = false;

  try {
    // Migrate Transactions
    if (fs.existsSync(LEGACY_DB_FILE) && !fs.existsSync(LEGACY_DB_FILE + '.bak')) {
      console.log('📦 Legacy transactions.json found. Migrating to SQLite...');
      const fileContent = fs.readFileSync(LEGACY_DB_FILE, 'utf8');
      const legacyTx = JSON.parse(fileContent);
      
      if (Array.isArray(legacyTx)) {
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO transactions (id, amount, donor, message, status, paymentUrl, raw_response, raw_webhook, createdAt, updatedAt, paidAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const tx of legacyTx) {
          const rawResponse = tx.raw_response ? JSON.stringify(tx.raw_response) : null;
          const rawWebhook = tx.raw_webhook ? JSON.stringify(tx.raw_webhook) : null;
          
          insertStmt.run(
            tx.id,
            tx.amount || 0,
            tx.donor || 'Anonymous',
            tx.message || '',
            tx.status || 'pending',
            tx.paymentUrl || null,
            rawResponse,
            rawWebhook,
            tx.createdAt || new Date().toISOString(),
            tx.updatedAt || new Date().toISOString(),
            tx.paidAt || null
          );
        }
        console.log(`✅ Successfully migrated ${legacyTx.length} legacy transactions.`);
      }
      migratedTransactions = true;
    }

    // Migrate Settings
    if (fs.existsSync(LEGACY_SETTINGS_FILE) && !fs.existsSync(LEGACY_SETTINGS_FILE + '.bak')) {
      console.log('📦 Legacy overlay-settings.json found. Migrating to SQLite...');
      const settingsContent = fs.readFileSync(LEGACY_SETTINGS_FILE, 'utf8');
      const legacySettings = JSON.parse(settingsContent);
      
      const insertSettingsStmt = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
      `);
      insertSettingsStmt.run('overlay_settings', JSON.stringify(legacySettings));
      
      console.log('✅ Successfully migrated settings.');
      migratedSettings = true;
    }

    // Rename migrated files to .bak
    if (migratedTransactions && fs.existsSync(LEGACY_DB_FILE)) {
      fs.renameSync(LEGACY_DB_FILE, LEGACY_DB_FILE + '.bak');
      console.log(`📁 Renamed legacy transactions.json to transactions.json.bak`);
    }
    if (migratedSettings && fs.existsSync(LEGACY_SETTINGS_FILE)) {
      fs.renameSync(LEGACY_SETTINGS_FILE, LEGACY_SETTINGS_FILE + '.bak');
      console.log(`📁 Renamed legacy overlay-settings.json to overlay-settings.json.bak`);
    }

  } catch (migrateErr) {
    console.error('⚠️ Database migration error:', migrateErr.message);
  }
}

/**
 * Fetch all transactions ordered by creation date descending.
 */
function getTransactions() {
  if (!db) return [];
  const query = db.prepare('SELECT * FROM transactions ORDER BY createdAt DESC');
  const rows = query.all();
  return rows.map(row => ({
    ...row,
    raw_response: row.raw_response ? JSON.parse(row.raw_response) : null,
    raw_webhook: row.raw_webhook ? JSON.parse(row.raw_webhook) : null
  }));
}

/**
 * Find a transaction by ID.
 */
function getTransactionById(id) {
  if (!db) return null;
  const query = db.prepare('SELECT * FROM transactions WHERE id = ?');
  const row = query.get(id);
  if (!row) return null;
  return {
    ...row,
    raw_response: row.raw_response ? JSON.parse(row.raw_response) : null,
    raw_webhook: row.raw_webhook ? JSON.parse(row.raw_webhook) : null
  };
}

/**
 * Merge and save/update a transaction.
 */
function saveTransaction(data) {
  if (!db) throw new Error('Database not initialized');
  const selectQuery = db.prepare('SELECT * FROM transactions WHERE id = ?');
  const existing = selectQuery.get(data.id);
  const now = new Date().toISOString();
  
  if (existing) {
    let rawResponse = existing.raw_response;
    if (data.raw_response !== undefined) {
      rawResponse = data.raw_response ? JSON.stringify(data.raw_response) : null;
    }
    let rawWebhook = existing.raw_webhook;
    if (data.raw_webhook !== undefined) {
      rawWebhook = data.raw_webhook ? JSON.stringify(data.raw_webhook) : null;
    }
    
    const updateStmt = db.prepare(`
      UPDATE transactions 
      SET amount = ?, donor = ?, message = ?, status = ?, paymentUrl = ?, raw_response = ?, raw_webhook = ?, updatedAt = ?, paidAt = ?
      WHERE id = ?
    `);
    
    updateStmt.run(
      data.amount !== undefined ? data.amount : existing.amount,
      data.donor !== undefined ? data.donor : existing.donor,
      data.message !== undefined ? data.message : existing.message,
      data.status !== undefined ? data.status : existing.status,
      data.paymentUrl !== undefined ? data.paymentUrl : existing.paymentUrl,
      rawResponse,
      rawWebhook,
      now,
      data.paidAt !== undefined ? data.paidAt : existing.paidAt,
      data.id
    );
    
    return {
      ...existing,
      ...data,
      raw_response: rawResponse ? JSON.parse(rawResponse) : null,
      raw_webhook: rawWebhook ? JSON.parse(rawWebhook) : null,
      updatedAt: now
    };
  } else {
    const rawResponse = data.raw_response ? JSON.stringify(data.raw_response) : null;
    const rawWebhook = data.raw_webhook ? JSON.stringify(data.raw_webhook) : null;
    const createdAt = data.createdAt || now;
    
    const insertStmt = db.prepare(`
      INSERT INTO transactions (id, amount, donor, message, status, paymentUrl, raw_response, raw_webhook, createdAt, updatedAt, paidAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    insertStmt.run(
      data.id,
      data.amount || 0,
      data.donor || 'Anonymous',
      data.message || '',
      data.status || 'pending',
      data.paymentUrl || null,
      rawResponse,
      rawWebhook,
      createdAt,
      now,
      data.paidAt || null
    );
    
    return {
      id: data.id,
      amount: data.amount || 0,
      donor: data.donor || 'Anonymous',
      message: data.message || '',
      status: data.status || 'pending',
      paymentUrl: data.paymentUrl || null,
      raw_response: data.raw_response || null,
      raw_webhook: data.raw_webhook || null,
      createdAt,
      updatedAt: now,
      paidAt: data.paidAt || null
    };
  }
}

/**
 * Fetch overlay settings from database or return default.
 */
function getSettings(defaultSettings) {
  if (!db) return defaultSettings;
  const query = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = query.get('overlay_settings');
  if (!row) {
    return defaultSettings;
  }
  try {
    return { ...defaultSettings, ...JSON.parse(row.value) };
  } catch (e) {
    return defaultSettings;
  }
}

/**
 * Save overlay settings.
 */
function saveSettings(settings) {
  if (!db) throw new Error('Database not initialized');
  const valueStr = JSON.stringify(settings);
  const checkQuery = db.prepare('SELECT 1 FROM settings WHERE key = ?');
  const existing = checkQuery.get('overlay_settings');
  
  if (existing) {
    const updateStmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    updateStmt.run(valueStr, 'overlay_settings');
  } else {
    const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    insertStmt.run('overlay_settings', valueStr);
  }
  
  return settings;
}

module.exports = {
  initDB,
  getTransactions,
  getTransactionById,
  saveTransaction,
  getSettings,
  saveSettings
};
