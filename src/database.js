const path = require('path');
const fs = require('fs');

let db = null;
let isFallback = false;
let memoryTransactions = [];
let memorySettings = null;
let initPromise = null;
let isInitialized = false;

/**
 * Initialize Connection to Turso database using @libsql/client,
 * and handle legacy migrations. Fallback to in-memory on error.
 */
async function initDB() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      useInMemoryFallback('TURSO_DATABASE_URL is not configured in environment variables');
      return;
    }

    console.log(`🔌 Connecting to Turso Database at ${url}...`);

    try {
      const { createClient } = require('@libsql/client');
      db = createClient({
        url,
        authToken
      });

      // 1. Create transactions table
      await db.execute(`
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
      await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      console.log('✅ Turso Database tables verified.');

      // 3. Auto Migration of Legacy JSON files (If Turso is empty and local files/backups exist)
      const DB_DIR = path.join(__dirname, '../data');
      const LEGACY_DB_FILE = path.join(DB_DIR, 'transactions.json');
      const LEGACY_SETTINGS_FILE = path.join(DB_DIR, 'overlay-settings.json');

      const txCountRes = await db.execute('SELECT count(*) as count FROM transactions');
      const settingsCountRes = await db.execute("SELECT count(*) as count FROM settings WHERE key = 'overlay_settings'");
      
      const isTxEmpty = txCountRes.rows[0].count === 0;
      const isSettingsEmpty = settingsCountRes.rows[0].count === 0;

      let txFileToMigrate = null;
      if (fs.existsSync(LEGACY_DB_FILE)) txFileToMigrate = LEGACY_DB_FILE;
      else if (fs.existsSync(LEGACY_DB_FILE + '.bak')) txFileToMigrate = LEGACY_DB_FILE + '.bak';

      let settingsFileToMigrate = null;
      if (fs.existsSync(LEGACY_SETTINGS_FILE)) settingsFileToMigrate = LEGACY_SETTINGS_FILE;
      else if (fs.existsSync(LEGACY_SETTINGS_FILE + '.bak')) settingsFileToMigrate = LEGACY_SETTINGS_FILE + '.bak';

      // Migrate Transactions if Turso is empty
      if (isTxEmpty && txFileToMigrate) {
        console.log(`📦 Legacy transactions file found (${path.basename(txFileToMigrate)}). Migrating to Turso DB...`);
        const fileContent = fs.readFileSync(txFileToMigrate, 'utf8');
        const legacyTx = JSON.parse(fileContent);
        
        if (Array.isArray(legacyTx)) {
          for (const tx of legacyTx) {
            const rawResponse = tx.raw_response ? JSON.stringify(tx.raw_response) : null;
            const rawWebhook = tx.raw_webhook ? JSON.stringify(tx.raw_webhook) : null;
            
            await db.execute({
              sql: `INSERT OR IGNORE INTO transactions (id, amount, donor, message, status, paymentUrl, raw_response, raw_webhook, createdAt, updatedAt, paidAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
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
              ]
            });
          }
          console.log(`✅ Successfully migrated ${legacyTx.length} legacy transactions to Turso.`);
        }
        
        if (txFileToMigrate === LEGACY_DB_FILE) {
          try {
            fs.renameSync(LEGACY_DB_FILE, LEGACY_DB_FILE + '.bak');
            console.log(`📁 Renamed legacy transactions.json to transactions.json.bak`);
          } catch (e) {}
        }
      }

      // Migrate Settings if Turso is empty
      if (isSettingsEmpty && settingsFileToMigrate) {
        console.log(`📦 Legacy settings file found (${path.basename(settingsFileToMigrate)}). Migrating to Turso DB...`);
        const settingsContent = fs.readFileSync(settingsFileToMigrate, 'utf8');
        const legacySettings = JSON.parse(settingsContent);
        
        await db.execute({
          sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
          args: ['overlay_settings', JSON.stringify(legacySettings)]
        });
        
        console.log('✅ Successfully migrated settings to Turso.');
        
        if (settingsFileToMigrate === LEGACY_SETTINGS_FILE) {
          try {
            fs.renameSync(LEGACY_SETTINGS_FILE, LEGACY_SETTINGS_FILE + '.bak');
            console.log(`📁 Renamed legacy overlay-settings.json to overlay-settings.json.bak`);
          } catch (e) {}
        }
      }

      isInitialized = true;
    } catch (err) {
      console.warn('⚠️ Warning: Cannot connect to Turso database. Falling back to in-memory database.');
      console.warn('Error details:', err.message);
      useInMemoryFallback(err.message);
    }
  })();

  return initPromise;
}

/**
 * Wait until database initialization finishes to avoid query race conditions during hot-reload.
 */
async function ensureConnected() {
  if (!isInitialized) {
    if (initPromise) {
      await initPromise;
    } else {
      await initDB();
    }
  }
}

/**
 * Fallback to in-memory lists when Turso DB is offline or environment variables are missing.
 */
function useInMemoryFallback(reason) {
  isFallback = true;
  isInitialized = true; // Mark as initialized so fallback operations can execute immediately
  console.log(`💡 Switched to In-Memory Fallback storage. Reason: ${reason}`);

  const DB_DIR = path.join(__dirname, '../data');
  const filesToTryTx = [
    path.join(DB_DIR, 'transactions.json'),
    path.join(DB_DIR, 'transactions.json.bak')
  ];
  const filesToTrySettings = [
    path.join(DB_DIR, 'overlay-settings.json'),
    path.join(DB_DIR, 'overlay-settings.json.bak')
  ];

  // Try to load any readable transactions
  for (const file of filesToTryTx) {
    try {
      if (fs.existsSync(file)) {
        memoryTransactions = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`📦 Loaded ${memoryTransactions.length} transactions into memory from ${path.basename(file)}`);
        break;
      }
    } catch (e) {}
  }

  // Try to load any readable settings
  for (const file of filesToTrySettings) {
    try {
      if (fs.existsSync(file)) {
        memorySettings = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`📦 Loaded settings into memory from ${path.basename(file)}`);
        break;
      }
    } catch (e) {}
  }
}

/**
 * Fetch all transactions ordered by creation date descending.
 */
async function getTransactions() {
  await ensureConnected();
  if (isFallback) {
    return [...memoryTransactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  if (!db) return [];
  const result = await db.execute('SELECT * FROM transactions ORDER BY createdAt DESC');
  return result.rows.map(row => ({
    ...row,
    raw_response: row.raw_response ? JSON.parse(row.raw_response) : null,
    raw_webhook: row.raw_webhook ? JSON.parse(row.raw_webhook) : null
  }));
}

/**
 * Find a transaction by ID.
 */
async function getTransactionById(id) {
  await ensureConnected();
  if (isFallback) {
    return memoryTransactions.find(t => t.id === id) || null;
  }
  if (!db) return null;
  const result = await db.execute({
    sql: 'SELECT * FROM transactions WHERE id = ?',
    args: [id]
  });
  const row = result.rows[0];
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
async function saveTransaction(data) {
  await ensureConnected();
  if (isFallback) {
    const existingIndex = memoryTransactions.findIndex(t => t.id === data.id);
    const now = new Date().toISOString();
    let updatedTx;

    if (existingIndex >= 0) {
      updatedTx = {
        ...memoryTransactions[existingIndex],
        ...data,
        updatedAt: now
      };
      memoryTransactions[existingIndex] = updatedTx;
    } else {
      updatedTx = {
        id: data.id,
        amount: data.amount || 0,
        donor: data.donor || 'Anonymous',
        message: data.message || '',
        status: data.status || 'pending',
        paymentUrl: data.paymentUrl || null,
        raw_response: data.raw_response || null,
        raw_webhook: data.raw_webhook || null,
        createdAt: data.createdAt || now,
        updatedAt: now,
        paidAt: data.paidAt || null
      };
      memoryTransactions.push(updatedTx);
    }

    try {
      const DB_DIR = path.join(__dirname, '../data');
      fs.writeFileSync(path.join(DB_DIR, 'transactions.json'), JSON.stringify(memoryTransactions, null, 2));
    } catch (e) {}

    return updatedTx;
  }

  if (!db) throw new Error('Database not initialized');
  const selectResult = await db.execute({
    sql: 'SELECT * FROM transactions WHERE id = ?',
    args: [data.id]
  });
  const existing = selectResult.rows[0];
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
    
    await db.execute({
      sql: `UPDATE transactions 
            SET amount = ?, donor = ?, message = ?, status = ?, paymentUrl = ?, raw_response = ?, raw_webhook = ?, updatedAt = ?, paidAt = ?
            WHERE id = ?`,
      args: [
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
      ]
    });
    
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
    
    await db.execute({
      sql: `INSERT INTO transactions (id, amount, donor, message, status, paymentUrl, raw_response, raw_webhook, createdAt, updatedAt, paidAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
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
      ]
    });
    
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
async function getSettings(defaultSettings) {
  await ensureConnected();
  if (isFallback) {
    return memorySettings ? { ...defaultSettings, ...memorySettings } : defaultSettings;
  }
  if (!db) return defaultSettings;
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: ['overlay_settings']
  });
  const row = result.rows[0];
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
async function saveSettings(settings) {
  await ensureConnected();
  if (isFallback) {
    memorySettings = settings;
    try {
      const DB_DIR = path.join(__dirname, '../data');
      fs.writeFileSync(path.join(DB_DIR, 'overlay-settings.json'), JSON.stringify(memorySettings, null, 2));
    } catch (e) {}
    return settings;
  }

  if (!db) throw new Error('Database not initialized');
  const valueStr = JSON.stringify(settings);
  const checkResult = await db.execute({
    sql: 'SELECT 1 FROM settings WHERE key = ?',
    args: ['overlay_settings']
  });
  const existing = checkResult.rows[0];
  
  if (existing) {
    await db.execute({
      sql: 'UPDATE settings SET value = ? WHERE key = ?',
      args: [valueStr, 'overlay_settings']
    });
  } else {
    await db.execute({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?)',
      args: ['overlay_settings', valueStr]
    });
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
