'use strict';

const db = require('./db');

const STATUSES = new Set(['yes', 'no', 'maybe']);

function list(eventId) {
  return db.prepare(`
    SELECT id, guest_name, status, party_size, note, created_at, updated_at
    FROM rsvps
    WHERE event_id = ?
    ORDER BY
      CASE status WHEN 'yes' THEN 0 WHEN 'maybe' THEN 1 ELSE 2 END,
      guest_name COLLATE NOCASE
  `).all(eventId);
}

function summary(rows) {
  const out = { yes: 0, no: 0, maybe: 0, coming: 0 };
  for (const row of rows) {
    if (row.status === 'yes') {
      out.yes += 1;
      out.coming += Number(row.party_size) || 0;
    } else if (row.status === 'maybe') {
      out.maybe += 1;
    } else if (row.status === 'no') {
      out.no += 1;
    }
  }
  return out;
}

function serialize(row, { includeNote = false } = {}) {
  const item = {
    id: row.id,
    name: row.guest_name,
    status: row.status,
    partySize: row.party_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeNote) item.note = row.note || '';
  return item;
}

function publicPayload(eventId) {
  const rows = list(eventId).filter((row) => row.status !== 'no');
  const all = list(eventId);
  return {
    summary: summary(all),
    entries: rows.map((row) => serialize(row)),
  };
}

function save(id, eventId, name, status, partySize, note) {
  const existing = db.prepare(`
    SELECT id FROM rsvps WHERE event_id = ? AND guest_name = ? COLLATE NOCASE
  `).get(eventId, name);
  if (existing) {
    db.prepare(`
      UPDATE rsvps
      SET guest_name = ?, status = ?, party_size = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(name, status, partySize, note || '', existing.id);
    return { id: existing.id, updated: true };
  }
  db.prepare(`
    INSERT INTO rsvps (id, event_id, guest_name, status, party_size, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, eventId, name, status, partySize, note || '');
  return { id, updated: false };
}

function remove(id, eventId) {
  return db.prepare('DELETE FROM rsvps WHERE id = ? AND event_id = ?').run(id, eventId);
}

module.exports = {
  STATUSES,
  list,
  summary,
  serialize,
  publicPayload,
  save,
  remove,
};
