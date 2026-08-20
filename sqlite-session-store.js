const session = require('express-session');

// Minimal express-session Store backed by the app's own better-sqlite3
// connection — avoids MemoryStore (leaks memory, doesn't survive restarts)
// without pulling in a second database or an extra native dependency.
// Rides on the same DB_PATH volume as the flashcard data, so logins survive
// redeploys too.
class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.getStmt = db.prepare('SELECT session, expires FROM sessions WHERE sid = ?');
    this.setStmt = db.prepare(
      'INSERT INTO sessions (sid, session, expires) VALUES (?, ?, ?) ' +
      'ON CONFLICT(sid) DO UPDATE SET session = excluded.session, expires = excluded.expires'
    );
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }

  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid);
      if (!row || row.expires < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.session));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const expires = sessionData.cookie && sessionData.cookie.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + 1000 * 60 * 60 * 24; // 1 day fallback
      this.setStmt.run(sid, JSON.stringify(sessionData), expires);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.destroyStmt.run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, sessionData, callback) {
    try {
      const expires = sessionData.cookie && sessionData.cookie.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + 1000 * 60 * 60 * 24;
      this.touchStmt.run(expires, sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = { SqliteSessionStore };
