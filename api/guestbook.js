'use strict';

const crypto = require('crypto');
const db = require('./db');

const MAX_ENTRIES = 200;
const CANONICAL = ['id', 'event_id', 'guest_name', 'message', 'created_at'];
let ready = false;

function columnRows() {
  return db.prepare('PRAGMA table_info(guestbook_entries)').all();
}

function columnNameSet() {
  return new Set(columnRows().map((c) => String(c.name).toLowerCase()));
}

function addColumn(name, ddl, fallbackDdl) {
  if (columnNameSet().has(name)) return;
  try {
    db.exec(`ALTER TABLE guestbook_entries ADD COLUMN ${ddl}`);
  } catch (err) {
    const msg = String(err && err.message);
    if (/duplicate column/i.test(msg)) return;
    if (fallbackDdl && /non-constant default/i.test(msg)) {
      db.exec(`ALTER TABLE guestbook_entries ADD COLUMN ${fallbackDdl}`);
      return;
    }
    throw err;
  }
}

function needsRebuild() {
  const cols = columnRows();
  const names = new Set(cols.map((c) => String(c.name).toLowerCase()));
  for (const name of CANONICAL) {
    if (!names.has(name)) return true;
  }
  for (const col of cols) {
    const name = String(col.name).toLowerCase();
    if (CANONICAL.includes(name)) continue;
    if (col.notnull && col.dflt_value == null) return true;
  }
  const idCol = cols.find((c) => String(c.name).toLowerCase() === 'id');
  if (idCol && String(idCol.type || '').toUpperCase() === 'INTEGER') return true;
  return false;
}

function pick(row, keys) {
  const lower = {};
  for (const [key, value] of Object.entries(row || {})) lower[key.toLowerCase()] = value;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(lower, key) || lower[key] == null) continue;
    const text = String(lower[key]);
    if (text) return text;
  }
  return null;
}

function createCanonicalTable() {
  db.exec(`
    CREATE TABLE guestbook_entries (
      id         TEXT PRIMARY KEY,
      event_id   TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      message    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_guestbook_event
      ON guestbook_entries(event_id, created_at);
  `);
}

function rebuild() {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'guestbook_entries'"
  ).get();
  const rows = exists ? db.prepare('SELECT * FROM guestbook_entries').all() : [];
  const tx = db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS guestbook_entries');
    createCanonicalTable();
    const ins = db.prepare(`
      INSERT INTO guestbook_entries (id, event_id, guest_name, message, created_at)
      VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))
    `);
    for (const row of rows) {
      const eventId = pick(row, ['event_id']);
      const name = pick(row, ['guest_name', 'name']);
      const message = pick(row, ['message', 'note', 'body', 'text']);
      if (!eventId || !name || !message) continue;
      const id = pick(row, ['id']) || crypto.randomBytes(10).toString('hex');
      ins.run(id, eventId, name, message, pick(row, ['created_at']));
    }
  });
  tx();
  ready = true;
}

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
  try {
    addColumn('event_id', 'event_id TEXT');
    addColumn('guest_name', 'guest_name TEXT');
    addColumn('message', 'message TEXT');
    addColumn('created_at', "created_at TEXT DEFAULT (datetime('now'))", 'created_at TEXT');
    if (needsRebuild()) rebuild();
  } catch (err) {
    if (!isRepairable(err)) throw err;
    rebuild();
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

function isRepairable(err) {
  const msg = String(err && err.message || '');
  return /no such (table|column)|no column named|constraint failed|datatype mismatch|foreign key|non-constant default/i.test(msg);
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
    if (!isRepairable(err)) throw err;
    ready = false;
    rebuild();
    return run();
  }
}

function insertEntry(id, eventId, name, message) {
  db.prepare(`
    INSERT INTO guestbook_entries (id, event_id, guest_name, message, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(id, eventId, name, message);
}

function add(id, eventId, name, message) {
  ensure();
  try {
    insertEntry(id, eventId, name, message);
  } catch (err) {
    if (!isRepairable(err)) throw err;
    ready = false;
    rebuild();
    insertEntry(id, eventId, name, message);
  }
}

function remove(entryId, eventId) {
  ensure();
  return db.prepare(
    'DELETE FROM guestbook_entries WHERE id = ? AND event_id = ?'
  ).run(entryId, eventId);
}

function removeForEvent(eventId) {
  ensure();
  return db.prepare('DELETE FROM guestbook_entries WHERE event_id = ?').run(eventId);
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
  removeForEvent,
  serialize,
};
