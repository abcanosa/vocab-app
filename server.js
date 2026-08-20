const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const { ensureSetup } = require('./setup');
const { SqliteSessionStore } = require('./sqlite-session-store');

const PORT = process.env.PORT || 3000;
// Override with DB_PATH to point at a persistent volume (e.g. on Railway,
// a mounted volume) — otherwise the database lives next to the app code and
// is lost whenever the deployment's filesystem resets.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'vocab.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
ensureSetup(db);

// better-sqlite3 crashes (native assertion failure) if the process is killed
// while it still holds an open connection — this is the pattern the library
// itself documents for closing cleanly on shutdown. Container platforms like
// Railway send SIGTERM routinely (restarts, redeploys, health-check cycling),
// so without this the app crash-loops instead of exiting cleanly.
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

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
    store: new SqliteSessionStore(db),
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

function getStudent(id) {
  if (!Number.isInteger(id)) return null;
  return db.prepare('SELECT id, name FROM students WHERE id = ?').get(id) || null;
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

// ---- Students ----

// Public: the student-side profile picker needs this before choosing a list.
app.get('/api/students', (req, res) => {
  const students = db.prepare('SELECT id, name FROM students ORDER BY name ASC').all();
  res.json(students);
});

// ---- Lists ----

// Public for students (must pass ?studentId= — only their assigned lists come
// back). Parents (authenticated) see every list plus who it's assigned to,
// since they manage assignments.
app.get('/api/lists', (req, res) => {
  const isParent = !!(req.session && req.session.authenticated);

  if (isParent) {
    const lists = db
      .prepare(
        `SELECT lists.id, lists.name, lists.grade_level AS gradeLevel,
                lists.practice_mode AS practiceMode, COUNT(DISTINCT words.id) AS wordCount
         FROM lists
         LEFT JOIN words ON words.list_id = lists.id
         GROUP BY lists.id
         ORDER BY lists.created_at ASC`
      )
      .all();
    const assignments = db.prepare('SELECT list_id, student_id FROM list_assignments').all();
    const byList = new Map();
    for (const a of assignments) {
      if (!byList.has(a.list_id)) byList.set(a.list_id, []);
      byList.get(a.list_id).push(a.student_id);
    }
    for (const list of lists) list.assignedStudentIds = byList.get(list.id) || [];
    return res.json(lists);
  }

  const studentId = Number(req.query.studentId);
  if (!getStudent(studentId)) {
    return res.status(400).json({ error: 'A valid studentId is required' });
  }
  const lists = db
    .prepare(
      `SELECT lists.id, lists.name, lists.grade_level AS gradeLevel,
              lists.practice_mode AS practiceMode, COUNT(DISTINCT words.id) AS wordCount
       FROM lists
       JOIN list_assignments ON list_assignments.list_id = lists.id AND list_assignments.student_id = ?
       LEFT JOIN words ON words.list_id = lists.id
       GROUP BY lists.id
       ORDER BY lists.created_at ASC`
    )
    .all(studentId);
  res.json(lists);
});

app.post('/api/lists', requireAuth, (req, res) => {
  const { name, gradeLevel, practiceMode, studentIds } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'List name is required' });
  }
  const cleanGrade = typeof gradeLevel === 'string' && gradeLevel.trim() ? gradeLevel.trim() : null;
  const cleanMode = PRACTICE_MODES.includes(practiceMode) ? practiceMode : 'flip';
  const validIds = new Set(db.prepare('SELECT id FROM students').all().map((s) => s.id));
  const cleanStudentIds = Array.isArray(studentIds)
    ? [...new Set(studentIds)].filter((id) => validIds.has(id))
    : [];

  const create = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO lists (name, grade_level, practice_mode) VALUES (?, ?, ?)')
      .run(name.trim(), cleanGrade, cleanMode);
    const insertAssignment = db.prepare('INSERT INTO list_assignments (list_id, student_id) VALUES (?, ?)');
    for (const studentId of cleanStudentIds) insertAssignment.run(info.lastInsertRowid, studentId);
    return info.lastInsertRowid;
  });
  const id = create();

  res.status(201).json({
    id,
    name: name.trim(),
    gradeLevel: cleanGrade,
    practiceMode: cleanMode,
    wordCount: 0,
    assignedStudentIds: cleanStudentIds,
  });
});

app.delete('/api/lists/:id', requireAuth, (req, res) => {
  const info = db.prepare('DELETE FROM lists WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'List not found' });
  res.json({ success: true });
});

// Parent-only: choose exactly which student(s) can see this list.
app.put('/api/lists/:id/assignments', requireAuth, (req, res) => {
  const { studentIds } = req.body || {};
  if (!Array.isArray(studentIds) || !studentIds.every((id) => Number.isInteger(id))) {
    return res.status(400).json({ error: 'studentIds must be an array of integers' });
  }
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const validIds = new Set(db.prepare('SELECT id FROM students').all().map((s) => s.id));
  const cleanIds = [...new Set(studentIds)].filter((id) => validIds.has(id));

  const setAssignments = db.transaction(() => {
    db.prepare('DELETE FROM list_assignments WHERE list_id = ?').run(req.params.id);
    const insert = db.prepare('INSERT INTO list_assignments (list_id, student_id) VALUES (?, ?)');
    for (const studentId of cleanIds) insert.run(req.params.id, studentId);
  });
  setAssignments();

  res.json({ studentIds: cleanIds });
});

// Parent-only: duplicate a list (and its words) as an independent copy
// assigned to another student — separate from just sharing the same list,
// each copy gets its own words to edit and its own progress/high score.
app.post('/api/lists/:id/copy', requireAuth, (req, res) => {
  const { studentId } = req.body || {};
  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  if (!getStudent(studentId)) {
    return res.status(400).json({ error: 'A valid studentId is required' });
  }

  const words = db.prepare('SELECT term, definition FROM words WHERE list_id = ?').all(list.id);

  const copy = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO lists (name, grade_level, practice_mode) VALUES (?, ?, ?)')
      .run(list.name, list.grade_level, list.practice_mode);
    const newListId = info.lastInsertRowid;
    const insertWord = db.prepare('INSERT INTO words (list_id, term, definition) VALUES (?, ?, ?)');
    for (const w of words) insertWord.run(newListId, w.term, w.definition);
    db.prepare('INSERT INTO list_assignments (list_id, student_id) VALUES (?, ?)').run(newListId, studentId);
    return newListId;
  });
  const newListId = copy();

  res.status(201).json({
    id: newListId,
    name: list.name,
    gradeLevel: list.grade_level,
    practiceMode: list.practice_mode,
    wordCount: words.length,
    assignedStudentIds: [studentId],
  });
});

// ---- Words ----

// Public: same reasoning as GET /api/lists — practicing shouldn't need the
// password. ?studentId= is optional here — the parent dashboard fetches
// words without it, students pass it to get their own three-piles progress.
app.get('/api/lists/:id/words', (req, res) => {
  const list = db
    .prepare(
      'SELECT id, name, grade_level AS gradeLevel, practice_mode AS practiceMode FROM lists WHERE id = ?'
    )
    .get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const studentId = Number(req.query.studentId) || null;
  const words = studentId
    ? db
        .prepare(
          `SELECT words.id, words.term, words.definition, word_progress.three_piles_status AS threePiles
           FROM words
           LEFT JOIN word_progress
             ON word_progress.word_id = words.id AND word_progress.student_id = ?
           WHERE words.list_id = ? ORDER BY words.created_at ASC`
        )
        .all(studentId, req.params.id)
    : db
        .prepare(
          `SELECT id, term, definition, NULL AS threePiles FROM words WHERE list_id = ? ORDER BY created_at ASC`
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

// Public: students sort their own cards while playing Three Piles. Progress
// is tracked per student, since the same list can be shared by more than one.
app.post('/api/words/:id/three-piles', (req, res) => {
  const { status, studentId } = req.body || {};
  if (!THREE_PILES_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (!getStudent(studentId)) {
    return res.status(400).json({ error: 'A valid studentId is required' });
  }
  const word = db.prepare('SELECT id FROM words WHERE id = ?').get(req.params.id);
  if (!word) return res.status(404).json({ error: 'Word not found' });

  db.prepare(
    `INSERT INTO word_progress (word_id, student_id, three_piles_status) VALUES (?, ?, ?)
     ON CONFLICT(word_id, student_id) DO UPDATE SET three_piles_status = excluded.three_piles_status`
  ).run(req.params.id, studentId, status);
  res.json({ success: true });
});

// Public: a student can reset their own Three Piles progress at any time.
app.post('/api/lists/:id/three-piles/reset', (req, res) => {
  const { studentId } = req.body || {};
  if (!getStudent(studentId)) {
    return res.status(400).json({ error: 'A valid studentId is required' });
  }
  const info = db
    .prepare(
      `DELETE FROM word_progress
       WHERE student_id = ? AND word_id IN (SELECT id FROM words WHERE list_id = ?)`
    )
    .run(studentId, req.params.id);
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

function getOrCreateListScore(listId, studentId) {
  let score = db
    .prepare('SELECT * FROM list_scores WHERE list_id = ? AND student_id = ?')
    .get(listId, studentId);
  if (!score) {
    db.prepare('INSERT INTO list_scores (list_id, student_id) VALUES (?, ?)').run(listId, studentId);
    score = db.prepare('SELECT * FROM list_scores WHERE list_id = ? AND student_id = ?').get(listId, studentId);
  }
  return score;
}

// Public: students need to see their own current high score before/after a
// round. studentId is required — high scores are tracked per student so one
// student's (or a parent's preview) score never shows up as another's.
app.get('/api/lists/:id/stats', (req, res) => {
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const studentId = Number(req.query.studentId);
  if (!getStudent(studentId)) {
    return res.status(400).json({ error: 'A valid studentId is required' });
  }

  const stats = getOrCreateListStats(req.params.id);
  const score = getOrCreateListScore(req.params.id, studentId);
  res.json({
    highScore: score.beat_score_high,
    rewardTarget: stats.reward_target,
    rewardText: stats.reward_text,
  });
});

// Public: submitting a Beat Your Score round result for a specific student.
// A parent previewing a game from the dashboard simply never calls this, so
// their runs never touch a student's high score.
app.post('/api/lists/:id/beat-score', (req, res) => {
  const { score, studentId } = req.body || {};
  if (!Number.isInteger(score) || score < 0) {
    return res.status(400).json({ error: 'score must be a non-negative integer' });
  }
  const list = db.prepare('SELECT id, name FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const student = getStudent(studentId);
  if (!student) return res.status(400).json({ error: 'A valid studentId is required' });

  const stats = getOrCreateListStats(req.params.id);
  const listScore = getOrCreateListScore(req.params.id, studentId);
  const isNewHigh = score > listScore.beat_score_high;
  if (isNewHigh) {
    db.prepare('UPDATE list_scores SET beat_score_high = ? WHERE list_id = ? AND student_id = ?').run(
      score,
      req.params.id,
      studentId
    );
  }

  let rewardEarned = false;
  if (stats.reward_target != null && score >= stats.reward_target) {
    rewardEarned = true;
    const message = stats.reward_text
      ? `🎉 ${student.name} scored ${score} in ${list.name} (Beat Your Score) and earned: ${stats.reward_text}!`
      : `🎉 ${student.name} scored ${score} in ${list.name} (Beat Your Score), hitting the reward target!`;
    db.prepare('INSERT INTO notifications (list_id, message) VALUES (?, ?)').run(req.params.id, message);
  }

  res.json({
    highScore: Math.max(score, listScore.beat_score_high),
    isNewHigh,
    rewardEarned,
    rewardText: stats.reward_text,
  });
});

// Parent-only: reward config plus every assigned student's current high
// score. Separate from the public per-student stats endpoint above, since a
// list no longer has one single high score to report.
app.get('/api/lists/:id/reward', requireAuth, (req, res) => {
  const list = db.prepare('SELECT id FROM lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const stats = getOrCreateListStats(req.params.id);
  const scores = db
    .prepare(
      `SELECT students.id AS studentId, students.name AS studentName,
              COALESCE(list_scores.beat_score_high, 0) AS highScore
       FROM list_assignments
       JOIN students ON students.id = list_assignments.student_id
       LEFT JOIN list_scores
         ON list_scores.list_id = list_assignments.list_id
        AND list_scores.student_id = list_assignments.student_id
       WHERE list_assignments.list_id = ?
       ORDER BY students.name ASC`
    )
    .all(req.params.id);
  res.json({ rewardTarget: stats.reward_target, rewardText: stats.reward_text, scores });
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
