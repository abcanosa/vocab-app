const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const { ensureSetup } = require('./setup');

const PORT = process.env.PORT || 3000;
// Override with DB_PATH to point at a persistent volume (e.g. on Railway,
// a mounted volume) — otherwise the database lives next to the app code and
// is lost whenever the deployment's filesystem resets.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vocab.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
ensureSetup(db);

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

const sessionSecret = getSetting.get('session_secret').value;

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    name: 'vocab.sid',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 days
  })
);
app.use(express.static(path.join(__dirname, 'public')));

const PRACTICE_MODES = ['flip', 'type'];

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Not authenticated' });
}

// ---- Auth ----

app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }
  const hash = getSetting.get('password_hash').value;
  if (!bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  req.session.authenticated = true;
  res.json({ success: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post('/api/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Both passwords are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }
  const hash = getSetting.get('password_hash').value;
  if (!bcrypt.compareSync(currentPassword, hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  setSetting.run('password_hash', bcrypt.hashSync(newPassword, 10));
  res.json({ success: true });
});

// ---- Lists ----

// Public: students need to browse lists and practice without the parent password.
app.get('/api/lists', (req, res) => {
  const lists = db
    .prepare(
      `SELECT lists.id, lists.name, lists.grade_level AS gradeLevel,
              lists.practice_mode AS practiceMode, COUNT(words.id) AS wordCount
       FROM lists
       LEFT JOIN words ON words.list_id = lists.id
       GROUP BY lists.id
       ORDER BY lists.created_at ASC`
    )
    .all();
  res.json(lists);
});

app.post('/api/lists', requireAuth, (req, res) => {
  const { name, gradeLevel, practiceMode } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'List name is required' });
  }
  const cleanGrade = typeof gradeLevel === 'string' && gradeLevel.trim() ? gradeLevel.trim() : null;
  const cleanMode = PRACTICE_MODES.includes(practiceMode) ? practiceMode : 'flip';
  try {
    const info = db
      .prepare('INSERT INTO lists (name, grade_level, practice_mode) VALUES (?, ?, ?)')
      .run(name.trim(), cleanGrade, cleanMode);
    res.status(201).json({
      id: info.lastInsertRowid,
      name: name.trim(),
      gradeLevel: cleanGrade,
      practiceMode: cleanMode,
      wordCount: 0,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A list with that name already exists' });
    }
    throw err;
  }
});

app.delete('/api/lists/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'List not found' });
  res.json({ success: true });
});

// ---- Words ----

// Public: same reasoning as GET /api/lists — practicing shouldn't need the password.
app.get('/api/lists/:id/words', (req, res) => {
  const list = db
    .prepare(
      'SELECT id, name, grade_level AS gradeLevel, practice_mode AS practiceMode FROM lists WHERE id = ?'
    )
    .get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const words = db
    .prepare(
      `SELECT id, term, definition, three_piles_status AS threePiles
       FROM words WHERE list_id = ? ORDER BY created_at ASC`
    )
    .all(req.params.id);
  res.json({ list, words });
});

app.post('/api/words', requireAuth, (req, res) => {
  const { listId, term, definition } = req.body || {};
  if (!listId || typeof term !== 'string' || typeof definition !== 'string') {
    return res.status(400).json({ error: 'listId, term, and definition are required' });
  }
  if (!term.trim() || !definition.trim()) {
    return res.status(400).json({ error: 'Term and definition cannot be empty' });
  }
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(listId);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const info = db
    .prepare('INSERT INTO words (list_id, term, definition) VALUES (?, ?, ?)')
    .run(listId, term.trim(), definition.trim());
  res.status(201).json({ id: info.lastInsertRowid, term: term.trim(), definition: definition.trim() });
});

app.delete('/api/words/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM words WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Word not found' });
  res.json({ success: true });
});

// ---- Multiplication games ----

const THREE_PILES_STATUSES = ['easy', 'almost', 'needs_practice'];

// Public: students sort their own cards while playing Three Piles.
app.post('/api/words/:id/three-piles', (req, res) => {
  const { status } = req.body || {};
  if (!THREE_PILES_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const info = db
    .prepare('UPDATE words SET three_piles_status = ? WHERE id = ?')
    .run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Word not found' });
  res.json({ success: true });
});

// Public: a student can reset their own Three Piles progress at any time.
app.post('/api/lists/:id/three-piles/reset', (req, res) => {
  const info = db
    .prepare('UPDATE words SET three_piles_status = NULL WHERE list_id = ?')
    .run(req.params.id);
  res.json({ success: true, cleared: info.changes });
});

function getOrCreateListStats(listId) {
  let stats = db.prepare('SELECT * FROM list_stats WHERE list_id = ?').get(listId);
  if (!stats) {
    db.prepare('INSERT INTO list_stats (list_id) VALUES (?)').run(listId);
    stats = db.prepare('SELECT * FROM list_stats WHERE list_id = ?').get(listId);
  }
  return stats;
}

// Public: students need to see the current high score before/after a round.
app.get('/api/lists/:id/stats', (req, res) => {
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const stats = getOrCreateListStats(req.params.id);
  res.json({
    highScore: stats.beat_score_high,
    rewardTarget: stats.reward_target,
    rewardText: stats.reward_text,
  });
});

// Public: submitting a Beat Your Score round result.
app.post('/api/lists/:id/beat-score', (req, res) => {
  const { score } = req.body || {};
  if (!Number.isInteger(score) || score < 0) {
    return res.status(400).json({ error: 'score must be a non-negative integer' });
  }
  const list = db.prepare('SELECT id, name FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const stats = getOrCreateListStats(req.params.id);
  const isNewHigh = score > stats.beat_score_high;
  if (isNewHigh) {
    db.prepare('UPDATE list_stats SET beat_score_high = ? WHERE list_id = ?').run(score, req.params.id);
  }

  let rewardEarned = false;
  if (stats.reward_target != null && score >= stats.reward_target) {
    rewardEarned = true;
    const message = stats.reward_text
      ? `🎉 ${list.name}: scored ${score} in Beat Your Score and earned: ${stats.reward_text}!`
      : `🎉 ${list.name}: scored ${score} in Beat Your Score, hitting the reward target!`;
    db.prepare('INSERT INTO notifications (list_id, message) VALUES (?, ?)').run(req.params.id, message);
  }

  res.json({
    highScore: Math.max(score, stats.beat_score_high),
    isNewHigh,
    rewardEarned,
    rewardText: stats.reward_text,
  });
});

// Parent-only: configure the Beat Your Score reward.
app.put('/api/lists/:id/reward', requireAuth, (req, res) => {
  const { rewardTarget, rewardText } = req.body || {};
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const cleanTarget =
    rewardTarget === null || rewardTarget === '' || rewardTarget === undefined
      ? null
      : Number(rewardTarget);
  if (cleanTarget !== null && (!Number.isInteger(cleanTarget) || cleanTarget < 1)) {
    return res.status(400).json({ error: 'rewardTarget must be a positive integer' });
  }
  const cleanText = typeof rewardText === 'string' && rewardText.trim() ? rewardText.trim() : null;

  getOrCreateListStats(req.params.id);
  db.prepare('UPDATE list_stats SET reward_target = ?, reward_text = ? WHERE list_id = ?').run(
    cleanTarget,
    cleanText,
    req.params.id
  );
  res.json({ rewardTarget: cleanTarget, rewardText: cleanText });
});

// ---- Notifications (parent-only) ----

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db
    .prepare('SELECT id, message, read, created_at AS createdAt FROM notifications ORDER BY created_at DESC')
    .all();
  res.json(notifications);
});

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const info = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Notification not found' });
  res.json({ success: true });
});

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  res.json({ success: true });
});

// ---- Fallback to SPA ----

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vocab app running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<your-computer-ip>:${PORT}`);
});
