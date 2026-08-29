'use strict';

const path    = require('path');
const fsp     = require('fs/promises');
const crypto  = require('crypto');
const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const admin = require('./admin');

const app  = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR      = path.join(__dirname, '..', 'public');
const ADMIN_DIR       = path.join(__dirname, '..', 'admin');
const MUSIC_DIR       = path.join(PUBLIC_DIR, 'music');
const IMAGES_DIR      = path.join(PUBLIC_DIR, 'images');
const MAX_LEADERBOARD = 25;

fsp.mkdir(IMAGES_DIR, { recursive: true }).catch(() => {});
fsp.mkdir(MUSIC_DIR,  { recursive: true }).catch(() => {});

app.use(cors());
app.use('/api/admin', admin);
app.use(express.json({ limit: '16kb' }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return crypto.randomBytes(10).toString('hex'); }

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function findActiveEvent(slug) {
  return db.prepare("SELECT * FROM events WHERE slug = ? AND status = 'active'").get(slug);
}

function fetchScores(eventId) {
  return db.prepare('SELECT * FROM score_submissions WHERE event_id = ?').all(eventId);
}

function rankAndFormat(rows) {
  return [...rows]
    .sort((a, b) => {
      const pA = a.total_questions ? a.score / a.total_questions : 0;
      const pB = b.total_questions ? b.score / b.total_questions : 0;
      if (pB !== pA) return pB - pA;
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.created_at) - new Date(b.created_at);
    })
    .slice(0, MAX_LEADERBOARD)
    .map((s) => ({
      name:           s.player_name,
      score:          s.score,
      totalQuestions: s.total_questions,
      timestamp:      new Date(s.created_at).getTime(),
    }));
}

function validateScore(body) {
  const { name, score, totalQuestions } = body || {};
  if (typeof name !== 'string' || !name.trim())
    return 'A valid name is required.';
  if (!Number.isFinite(score) || score < 0)
    return 'A valid score is required.';
  if (!Number.isFinite(totalQuestions) || totalQuestions <= 0)
    return 'A valid totalQuestions is required.';
  if (score > totalQuestions)
    return 'Score cannot exceed totalQuestions.';
  return null;
}

// ── Public event config ───────────────────────────────────────────────────────
//
// Returns everything the quiz SPA needs: theme, ecard, questions, score tiers.
// Shape matches the original quiz-config.json so app.js needs minimal changes.

app.get('/api/events/:slug/public-config', (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found or unavailable.' });

    const quiz = db.prepare('SELECT * FROM quizzes WHERE event_id = ?').get(event.id);
    const questions = quiz
      ? db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order').all(quiz.id)
      : [];

    res.json({
      meta: {
        title:          quiz?.title          ?? event.name,
        subtitle:       quiz?.subtitle       ?? null,
        honoree:        quiz?.honoree        ?? null,
        welcomeMessage: quiz?.welcome_message ?? null,
        heroImage:      quiz?.hero_image     ?? null,
        theme:          parseJson(event.theme_json || quiz?.theme_json, {}),
      },
      ecard:      parseJson(quiz?.ecard_json, {}),
      audio:      parseJson(quiz?.audio_json, {}),
      scoreTiers: parseJson(quiz?.score_tiers_json, []),
      questions:  event.enable_quiz ? questions.map((q) => ({
        id:           q.id,
        submittedBy:  q.submitted_by,
        type:         q.question_type,
        question:     q.question,
        image:        q.image_url || null,
        options:      parseJson(q.options_json, []),
        correctIndex: q.correct_index,
        funFact:      q.fun_fact   || null,
        audioClip:    q.audio_clip || null,
      })) : [],
      flags: {
        enableQuiz:        !!event.enable_quiz,
        enableLeaderboard: !!event.enable_leaderboard,
      },
    });
  } catch (err) {
    console.error('GET public-config:', err);
    res.status(500).json({ error: 'Unable to load event config.' });
  }
});

// ── Leaderboard: GET ──────────────────────────────────────────────────────────

app.get('/api/events/:slug/scores', (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(rankAndFormat(fetchScores(event.id)));
  } catch (err) {
    console.error('GET scores:', err);
    res.status(500).json({ error: 'Unable to read scores.' });
  }
});

// ── Leaderboard: POST ─────────────────────────────────────────────────────────

app.post('/api/events/:slug/scores', (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event)                  return res.status(404).json({ error: 'Event not found.' });
    if (!event.enable_leaderboard) return res.status(403).json({ error: 'Leaderboard not enabled.' });

    const err = validateScore(req.body);
    if (err) return res.status(400).json({ error: err });

    const { name, score, totalQuestions } = req.body;
    db.prepare(`
      INSERT INTO score_submissions (id, event_id, player_name, score, total_questions)
      VALUES (?, ?, ?, ?, ?)
    `).run(uid(), event.id, name.trim().slice(0, 30), Math.round(score), Math.round(totalQuestions));

    res.status(201).json(rankAndFormat(fetchScores(event.id)));
  } catch (err) {
    console.error('POST scores:', err);
    res.status(500).json({ error: 'Unable to save score.' });
  }
});

// ── Music listing ─────────────────────────────────────────────────────────────

app.get('/api/music', async (_req, res) => {
  try {
    const files = await fsp.readdir(MUSIC_DIR);
    res.json(files.filter((f) => /\.mp3$/i.test(f)));
  } catch { res.json([]); }
});

// ── Static files ──────────────────────────────────────────────────────────────
// index:false so public/index.html is not served at /. The quiz SPA is /e/:slug only.

app.use(express.static(PUBLIC_DIR, { index: false }));

app.get('/e/:slug', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use('/admin', express.static(ADMIN_DIR, { index: false }));
app.get(/^\/admin(\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});

app.get('/', (_req, res) => res.redirect(302, '/admin'));

// Catch-all API 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Event portal running → http://localhost:${PORT}`);
  console.log(`  Admin dashboard    → http://localhost:${PORT}/admin`);
  console.log(`  Public quiz        → http://localhost:${PORT}/e/<slug>`);
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length < 8) {
    console.warn('  ADMIN_TOKEN is not set — /admin login will be unavailable.');
  }
});
