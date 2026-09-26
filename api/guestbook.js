'use strict';

const db = require('./db');

const MAX_ENTRIES = 200;
let ready = false;

function ensureGuestbookSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guestbook_entries (
      id         TEXT PRIMARY KEY,
      event_id   TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const cols = new Set(
    db.prepare('PRAGMA table_info(guestbook_entries)').all().map((c) => c.name)
  );
  if (!cols.has('event_id')) db.exec('ALTER TABLE guestbook_entries ADD COLUMN event_id TEXT');
  if (!cols.has('guest_name')) db.exec('ALTER TABLE guestbook_entries ADD COLUMN guest_name TEXT');
  if (!cols.has('message')) db.exec('ALTER TABLE guestbook_entries ADD COLUMN message TEXT');
  if (!cols.has('created_at')) {
    db.exec("ALTER TABLE guestbook_entries ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_guestbook_event
      ON guestbook_entries(event_id, created_at);
  `);
  ready = true;
}

function ensure() {
  if (!ready) ensureGuestbookSchema();
}

function list(eventId) {
  const run = () => db.prepare(`
    SELECT id, guest_name, message, created_at
    FROM guestbook_entries
    WHERE event_id = ?
    ORDER BY created_at DESC
  `).all(eventId).slice(0, MAX_ENTRIES);

  ensure();
  try {
    return run();
  } catch (err) {
    if (!/no such (table|column)/i.test(String(err && err.message))) throw err;
    ready = false;
    ensure();
    return run();
  }
}

function add(id, eventId, name, message) {
  const run = () => db.prepare(`
    INSERT INTO guestbook_entries (id, event_id, guest_name, message)
    VALUES (?, ?, ?, ?)
  `).run(id, eventId, name, message);

  ensure();
  try {
    run();
  } catch (err) {
    const msg = String(err && err.message || '');
    if (/no such (table|column)/i.test(msg)) {
      ready = false;
      ensure();
      run();
      return;
    }
    if (/foreign key/i.test(msg)) {
      db.pragma('foreign_keys = OFF');
      try { run(); }
      finally { db.pragma('foreign_keys = ON'); }
      return;
    }
    throw err;
  }
}

function remove(entryId, eventId) {
  ensure();
  return db.prepare(
    'DELETE FROM guestbook_entries WHERE id = ? AND event_id = ?'
  ).run(entryId, eventId);
}

function serialize(rows) {
  return rows.map((r) => ({
    id: r.id,
    name: r.guest_name || '',
    message: r.message || '',
    createdAt: r.created_at || null,
  }));
}

module.exports = {
  MAX_ENTRIES,
  ensure,
  list,
  add,
  remove,
  serialize,
};
