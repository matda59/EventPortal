'use strict';

/**
 * Seed script — runs automatically on every container start (see Dockerfile CMD).
 * Uses INSERT OR IGNORE so re-runs are completely safe — existing data is never
 * overwritten or duplicated.
 */

const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const db     = require('./db');

const ROOT        = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'public', 'data', 'quiz-config.json');

function uid() { return crypto.randomBytes(10).toString('hex'); }

function seed() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log('ℹ  No quiz-config.json found — skipping seed.');
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const meta   = config.meta  || {};
  const ecard  = config.ecard || {};

  // ── Event ──────────────────────────────────────────────────────────
  const eventId = uid();
  db.prepare(`
    INSERT OR IGNORE INTO events
      (id, slug, name, occasion_type, status, theme_preset, theme_json,
       header_emoji, enable_quiz, enable_leaderboard)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId, 'naomi40th', "Naomi's 40th", 'Birthday', 'active',
    'custom', JSON.stringify(meta.theme || {}), '🎉', 1, 1,
  );

  // Fetch actual id (INSERT OR IGNORE means the above may have been a no-op)
  const event = db.prepare('SELECT id FROM events WHERE slug = ?').get('naomi40th');
  if (!event) return;

  // ── Quiz ───────────────────────────────────────────────────────────
  const quizId = uid();
  db.prepare(`
    INSERT OR IGNORE INTO quizzes
      (id, event_id, title, subtitle, honoree, welcome_message, hero_image,
       audio_json, score_tiers_json, ecard_json, theme_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    quizId, event.id,
    meta.title          || 'How Well Do You Know Naomi?',
    meta.subtitle       || null,
    meta.honoree        || null,
    meta.welcomeMessage || null,
    meta.heroImage      || null,
    JSON.stringify(config.audio       || {}),
    JSON.stringify(config.scoreTiers  || []),
    JSON.stringify({ greeting: ecard.greeting, subGreeting: ecard.subGreeting,
                     message: ecard.message, buttonText: ecard.buttonText,
                     photos: ecard.photos || [] }),
    JSON.stringify(meta.theme || {}),
  );

  const quiz = db.prepare('SELECT id FROM quizzes WHERE event_id = ?').get(event.id);
  if (!quiz) return;

  // ── Questions (only if none exist yet) ─────────────────────────────
  const qCount = db.prepare('SELECT COUNT(*) as n FROM quiz_questions WHERE quiz_id = ?').get(quiz.id).n;
  if (qCount === 0) {
    const questions = Array.isArray(config.questions) ? config.questions : [];
    const ins = db.prepare(`
      INSERT INTO quiz_questions
        (id, quiz_id, sort_order, submitted_by, question_type, question,
         image_url, options_json, correct_index, fun_fact, audio_clip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction((qs) => qs.forEach((q, i) =>
      ins.run(uid(), quiz.id, i, q.submittedBy||null, q.type||'text',
              q.question, q.image||null, JSON.stringify(q.options||[]),
              q.correctIndex, q.funFact||null, q.audioClip||null)
    ))(questions);
    if (questions.length) console.log(`✔  Seeded ${questions.length} questions for Naomi's 40th`);
  }

  console.log("✔  Seed complete — Naomi's 40th is ready at /e/naomi40th");
}

try { seed(); }
catch (err) { console.error('Seed error (non-fatal):', err.message); }
