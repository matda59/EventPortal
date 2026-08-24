'use strict';

const path    = require('path');
const fsp     = require('fs/promises');
const crypto  = require('crypto');
const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR      = path.join(__dirname, '..', 'public');
const MUSIC_DIR       = path.join(PUBLIC_DIR, 'music');
const MAX_LEADERBOARD = 25;

app.use(cors());
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

app.use(express.static(PUBLIC_DIR));

// Serve the quiz SPA for any event slug
app.get('/e/:slug', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Root redirect → show a simple portal page (will become admin dashboard in Session 4)
app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Event Portal</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; align-items: center;
               justify-content: center; min-height: 100vh; margin: 0;
               background: #f8fafc; color: #1e293b; }
        .card { text-align: center; padding: 48px 40px; background: white;
                border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.1);
                max-width: 420px; }
        h1 { font-size: 2rem; margin-bottom: 8px; }
        p  { color: #64748b; margin-bottom: 24px; line-height: 1.6; }
        a  { display: inline-block; padding: 12px 28px; background: #6366f1;
             color: white; border-radius: 8px; text-decoration: none;
             font-weight: 600; transition: background 0.2s; }
        a:hover { background: #4f46e5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div style="font-size:3rem;margin-bottom:16px">🎉</div>
        <h1>Event Portal</h1>
        <p>Admin dashboard coming soon. Events are live at <code>/e/your-slug</code>.</p>
        <a href="/e/naomi40th">View Naomi's 40th →</a>
      </div>
    </body>
    </html>
  `);
});

// Catch-all API 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🎉 Event portal running → http://localhost:${PORT}`);
  console.log(`   Naomi's quiz         → http://localhost:${PORT}/e/naomi40th`);
});
