const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DEFAULT_PASSWORD = 'password123';
const DEFAULT_STUDENTS = ['Elias', 'Nadia'];

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

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      session TEXT NOT NULL,
      expires INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS list_assignments (
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS word_progress (
      word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      three_piles_status TEXT,
      PRIMARY KEY (word_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS list_scores (
      list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      beat_score_high INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (list_id, student_id)
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

  // Lists used to require a globally unique name. Now that the same list can
  // be copied across students, two different students' lists may share a
  // name — rebuild the table without the UNIQUE constraint.
  const listsHasUniqueName = db
    .prepare("PRAGMA index_list('lists')")
    .all()
    .some((idx) => idx.origin === 'u');
  if (listsHasUniqueName) {
    db.exec(`
      CREATE TABLE lists_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        grade_level TEXT,
        practice_mode TEXT NOT NULL DEFAULT 'flip',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO lists_new SELECT id, name, grade_level, practice_mode, created_at FROM lists;
      DROP TABLE lists;
      ALTER TABLE lists_new RENAME TO lists;
    `);
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

  const insertStudent = db.prepare('INSERT OR IGNORE INTO students (name) VALUES (?)');
  for (const name of DEFAULT_STUDENTS) insertStudent.run(name);
  const getStudentId = (name) => db.prepare('SELECT id FROM students WHERE name = ?').get(name).id;
  const eliasId = getStudentId('Elias');

  // Per-student "three piles" progress replaces the old single column on
  // words, since the same list (and its progress) can now be shared by
  // multiple students. Existing progress belonged to Elias, the only
  // student who existed before this migration.
  const wordColumns = db.prepare('PRAGMA table_info(words)').all();
  if (wordColumns.some((c) => c.name === 'three_piles_status')) {
    db.prepare(
      `INSERT INTO word_progress (word_id, student_id, three_piles_status)
       SELECT id, ?, three_piles_status FROM words WHERE three_piles_status IS NOT NULL`
    ).run(eliasId);
    db.exec('ALTER TABLE words DROP COLUMN three_piles_status');
  }

  // Same reasoning for Beat Your Score high scores: they used to live on
  // list_stats (one per list); now they live per (list, student).
  const listStatsColumns = db.prepare('PRAGMA table_info(list_stats)').all();
  if (listStatsColumns.some((c) => c.name === 'beat_score_high')) {
    db.prepare(
      `INSERT INTO list_scores (list_id, student_id, beat_score_high)
       SELECT list_id, ?, beat_score_high FROM list_stats WHERE beat_score_high > 0`
    ).run(eliasId);
    db.exec('ALTER TABLE list_stats DROP COLUMN beat_score_high');
  }

  seedMultiplicationList(db);

  // One-time: every list that existed before students were introduced
  // belonged to Elias. Runs once (guarded by the settings flag) so it never
  // re-assigns a list a parent has since deliberately unassigned.
  if (!getSetting.get('lists_migrated_to_elias')) {
    db.prepare(
      `INSERT OR IGNORE INTO list_assignments (list_id, student_id)
       SELECT id, ? FROM lists WHERE id NOT IN (SELECT list_id FROM list_assignments)`
    ).run(eliasId);
    setSetting.run('lists_migrated_to_elias', '1');
  }
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
