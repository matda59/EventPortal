'use strict';

const crypto = require('crypto');
const db = require('./db');

const MAX_ENTRIES = 200;
let ready = false;

function ensureGallerySchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gallery_uploads (
      id         TEXT PRIMARY KEY,
      event_id   TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      caption    TEXT,
      filename   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const cols = new Set(
    db.prepare('PRAGMA table_info(gallery_uploads)').all().map((c) => c.name)
  );
  if (!cols.has('event_id')) db.exec('ALTER TABLE gallery_uploads ADD COLUMN event_id TEXT');
  if (!cols.has('guest_name')) db.exec('ALTER TABLE gallery_uploads ADD COLUMN guest_name TEXT');
  if (!cols.has('caption')) db.exec('ALTER TABLE gallery_uploads ADD COLUMN caption TEXT');
  if (!cols.has('filename')) db.exec('ALTER TABLE gallery_uploads ADD COLUMN filename TEXT');
  if (!cols.has('created_at')) {
    db.exec("ALTER TABLE gallery_uploads ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gallery_event
      ON gallery_uploads(event_id, created_at);
  `);
  ready = true;
}

function ensure() {
  if (!ready) ensureGallerySchema();
}

function list(eventId) {
  const run = () => db.prepare(`
    SELECT id, guest_name, caption, filename, created_at
    FROM gallery_uploads
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

function count(eventId) {
  ensure();
  const row = db.prepare(
    'SELECT COUNT(*) AS n FROM gallery_uploads WHERE event_id = ?'
  ).get(eventId);
  return row ? row.n : 0;
}

function add(id, eventId, name, caption, filename) {
  const run = () => db.prepare(`
    INSERT INTO gallery_uploads (id, event_id, guest_name, caption, filename)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, eventId, name, caption || '', filename);

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

function removeByFilename(eventId, filename) {
  ensure();
  return db.prepare(
    'DELETE FROM gallery_uploads WHERE event_id = ? AND filename = ?'
  ).run(eventId, filename);
}

function namesFor(eventId) {
  const map = new Map();
  for (const row of list(eventId)) {
    if (row.filename) map.set(row.filename, row.guest_name || '');
  }
  return map;
}

function copy(fromId, toId) {
  ensure();
  const rows = db.prepare(`
    SELECT guest_name, caption, filename
    FROM gallery_uploads
    WHERE event_id = ?
  `).all(fromId);
  const ins = db.prepare(`
    INSERT INTO gallery_uploads (id, event_id, guest_name, caption, filename)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    ins.run(crypto.randomBytes(10).toString('hex'), toId, row.guest_name, row.caption || '', row.filename);
  }
}

module.exports = {
  MAX_ENTRIES,
  ensure,
  list,
  count,
  add,
  removeByFilename,
  namesFor,
  copy,
};
