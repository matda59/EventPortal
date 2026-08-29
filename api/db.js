'use strict';

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'portal.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    slug          TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    occasion_type TEXT NOT NULL DEFAULT 'Birthday',
    event_date    TEXT,
    status        TEXT NOT NULL DEFAULT 'active',
    theme_preset  TEXT,
    theme_json    TEXT,
    header_emoji  TEXT DEFAULT '🎉',
    enable_quiz        INTEGER NOT NULL DEFAULT 0,
    enable_leaderboard INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS quizzes (
    id              TEXT PRIMARY KEY,
    event_id        TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    subtitle        TEXT,
    honoree         TEXT,
    welcome_message TEXT,
    hero_image      TEXT,
    audio_json      TEXT,
    score_tiers_json TEXT NOT NULL DEFAULT '[]',
    ecard_json      TEXT,
    theme_json      TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_questions (
    id            TEXT PRIMARY KEY,
    quiz_id       TEXT NOT NULL,
    sort_order    INTEGER NOT NULL,
    submitted_by  TEXT,
    question_type TEXT NOT NULL DEFAULT 'text',
    question      TEXT NOT NULL,
    image_url     TEXT,
    options_json  TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL,
    fun_fact      TEXT,
    audio_clip    TEXT,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_questions_quiz_order
    ON quiz_questions(quiz_id, sort_order);

  CREATE TABLE IF NOT EXISTS score_submissions (
    id              TEXT PRIMARY KEY,
    event_id        TEXT NOT NULL,
    player_name     TEXT NOT NULL,
    score           INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scores_event
    ON score_submissions(event_id, score);

  CREATE TABLE IF NOT EXISTS quiz_sessions (
    id                TEXT PRIMARY KEY,
    event_id          TEXT NOT NULL,
    player_name       TEXT NOT NULL,
    question_ids_json TEXT NOT NULL,
    score             INTEGER NOT NULL DEFAULT 0,
    total_questions   INTEGER NOT NULL,
    submitted         INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_event
    ON quiz_sessions(event_id, created_at);

  CREATE TABLE IF NOT EXISTS quiz_answers (
    session_id     TEXT NOT NULL,
    question_id    TEXT NOT NULL,
    selected_index INTEGER NOT NULL,
    is_correct     INTEGER NOT NULL,
    PRIMARY KEY (session_id, question_id),
    FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE
  );
`);

const scoreCols = db.prepare('PRAGMA table_info(score_submissions)').all();
if (!scoreCols.some((c) => c.name === 'session_id')) {
  db.exec('ALTER TABLE score_submissions ADD COLUMN session_id TEXT');
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_session
    ON score_submissions(session_id) WHERE session_id IS NOT NULL
`);

module.exports = db;
