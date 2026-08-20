const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DEFAULT_PASSWORD = 'password123';

function ensureSetup(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      grade_level TEXT,
      practice_mode TEXT NOT NULL DEFAULT 'flip',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      three_piles_status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS list_stats (
      list_id INTEGER PRIMARY KEY REFERENCES lists(id) ON DELETE CASCADE,
      beat_score_high INTEGER NOT NULL DEFAULT 0,
      reward_target INTEGER,
      reward_text TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    PRAGMA foreign_keys = ON;
  `);

  // Additive migrations for databases created before these columns existed.
  const listColumns = db.prepare('PRAGMA table_info(lists)').all();
  if (!listColumns.some((c) => c.name === 'grade_level')) {
    db.exec('ALTER TABLE lists ADD COLUMN grade_level TEXT');
  }
  if (!listColumns.some((c) => c.name === 'practice_mode')) {
    db.exec("ALTER TABLE lists ADD COLUMN practice_mode TEXT NOT NULL DEFAULT 'flip'");
  }
  const wordColumns = db.prepare('PRAGMA table_info(words)').all();
  if (!wordColumns.some((c) => c.name === 'three_piles_status')) {
    db.exec('ALTER TABLE words ADD COLUMN three_piles_status TEXT');
  }

  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  if (!getSetting.get('password_hash')) {
    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    setSetting.run('password_hash', hash);
  }

  if (!getSetting.get('session_secret')) {
    setSetting.run('session_secret', crypto.randomBytes(32).toString('hex'));
  }

  seedMultiplicationList(db);
}

// Idempotent: only runs once, the first time the app starts without a list
// named "Multiplication" already present. Won't re-create it if a teacher
// later renames or deletes it.
function seedMultiplicationList(db) {
  const existing = db.prepare('SELECT id FROM lists WHERE name = ?').get('Multiplication');
  if (existing) return;

  const insertList = db.prepare(
    'INSERT INTO lists (name, grade_level, practice_mode) VALUES (?, ?, ?)'
  );
  const insertWord = db.prepare(
    'INSERT INTO words (list_id, term, definition) VALUES (?, ?, ?)'
  );

  const seed = db.transaction(() => {
    const info = insertList.run('Multiplication', '3', 'type');
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        insertWord.run(info.lastInsertRowid, `${a} × ${b}`, String(a * b));
      }
    }
  });
  seed();
}

module.exports = { ensureSetup, DEFAULT_PASSWORD };
