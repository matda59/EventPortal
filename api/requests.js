'use strict';

const db = require('./db');

const MAX_REQUESTS = 80;

function list(eventId) {
  return db.prepare(`
    SELECT id, guest_name, title, note, created_at
    FROM song_requests
    WHERE event_id = ?
    ORDER BY created_at DESC
  `).all(eventId).slice(0, MAX_REQUESTS);
}

function count(eventId) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM song_requests WHERE event_id = ?').get(eventId);
  return row ? row.n : 0;
}

function serialize(row) {
  return {
    id: row.id,
    name: row.guest_name,
    title: row.title,
    note: row.note || '',
    createdAt: row.created_at,
  };
}

function add(id, eventId, name, title, note) {
  db.prepare(`
    INSERT INTO song_requests (id, event_id, guest_name, title, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, eventId, name, title, note || '');
}

function remove(id, eventId) {
  return db.prepare('DELETE FROM song_requests WHERE id = ? AND event_id = ?').run(id, eventId);
}

module.exports = {
  MAX_REQUESTS,
  list,
  count,
  serialize,
  add,
  remove,
};
