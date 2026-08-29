'use strict';

/**
 * Admin API — cookie-gated CRUD + media uploads into the Docker volumes.
 * Mounted at /api/admin. Public quiz routes stay read-only without a token.
 */

const path    = require('path');
const fs      = require('fs');
const fsp     = require('fs/promises');
const crypto  = require('crypto');
const express = require('express');
const db      = require('./db');

const COOKIE      = 'ep_admin';
const COOKIE_MAX  = 60 * 60 * 24 * 14;
const PUBLIC_DIR  = path.join(__dirname, '..', 'public');
const IMAGES_DIR  = path.join(PUBLIC_DIR, 'images');
const MUSIC_DIR   = path.join(PUBLIC_DIR, 'music');
const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const SLUG_RE     = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES    = new Set(['active', 'draft', 'ended']);
const MAX_UPLOAD  = 25 * 1024 * 1024;

fs.mkdirSync(IMAGES_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR,  { recursive: true });

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

function uid() { return crypto.randomBytes(10).toString('hex'); }

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

function adminToken() {
  const t = process.env.ADMIN_TOKEN;
  return (typeof t === 'string' && t.length >= 8) ? t : null;
}

function signCookie(token) {
  return crypto.createHmac('sha256', token).update('event-portal-admin-v1').digest('hex');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function isAuthed(req) {
  const token = adminToken();
  if (!token) return false;
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return safeEqual(auth.slice(7), token);
  const cookie = parseCookies(req)[COOKIE];
  return Boolean(cookie && safeEqual(cookie, signCookie(token)));
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Authentication required.' });
}

function touchEvent(eventId) {
  db.prepare("UPDATE events SET updated_at = datetime('now') WHERE id = ?").run(eventId);
}

function eventById(id) {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id);
}

function quizByEvent(eventId) {
  return db.prepare('SELECT * FROM quizzes WHERE event_id = ?').get(eventId);
}

function serializeEvent(row, extras = {}) {
  return {
    id:                row.id,
    slug:              row.slug,
    name:              row.name,
    occasionType:      row.occasion_type,
    eventDate:         row.event_date,
    status:            row.status,
    themePreset:       row.theme_preset,
    theme:             parseJson(row.theme_json, {}),
    headerEmoji:       row.header_emoji,
    enableQuiz:        !!row.enable_quiz,
    enableLeaderboard: !!row.enable_leaderboard,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
    ...extras,
  };
}

function serializeQuiz(row) {
  if (!row) return null;
  return {
    id:              row.id,
    eventId:         row.event_id,
    title:           row.title,
    subtitle:        row.subtitle,
    honoree:         row.honoree,
    welcomeMessage:  row.welcome_message,
    heroImage:       row.hero_image,
    audio:           parseJson(row.audio_json, {}),
    scoreTiers:      parseJson(row.score_tiers_json, []),
    ecard:           parseJson(row.ecard_json, {}),
    theme:           parseJson(row.theme_json, {}),
  };
}

function serializeQuestion(row) {
  return {
    id:           row.id,
    quizId:       row.quiz_id,
    sortOrder:    row.sort_order,
    submittedBy:  row.submitted_by,
    type:         row.question_type,
    question:     row.question,
    image:        row.image_url,
    options:      parseJson(row.options_json, []),
    correctIndex: row.correct_index,
    funFact:      row.fun_fact,
    audioClip:    row.audio_clip,
  };
}

function readSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 64) {
    return { error: 'Slug must be 2–64 characters of lowercase letters, numbers, and hyphens.' };
  }
  return { slug };
}

function readStatus(value, fallback) {
  const status = String(value || fallback || 'draft').trim();
  if (!STATUSES.has(status)) return { error: 'Status must be active, draft, or ended.' };
  return { status };
}

function readTheme(value) {
  if (value == null || value === '') return {};
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const key of ['primaryRed', 'accentOrange', 'highlightPink', 'bgEarth', 'surfaceCard', 'textDark']) {
    if (typeof value[key] === 'string' && value[key].trim()) out[key] = value[key].trim();
  }
  return out;
}

function str(value, max, fallback = null) {
  if (value == null) return fallback;
  const s = String(value).trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

function ensureQuiz(eventId, title) {
  const existing = quizByEvent(eventId);
  if (existing) return existing;
  const id = uid();
  db.prepare(`
    INSERT INTO quizzes
      (id, event_id, title, subtitle, honoree, welcome_message, hero_image,
       audio_json, score_tiers_json, ecard_json, theme_json)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, '{}', '[]', '{}', '{}')
  `).run(id, eventId, title || 'Quiz');
  return quizByEvent(eventId);
}

function uniqueFilename(dir, original) {
  const ext  = path.extname(original).toLowerCase();
  const base = path.basename(original, ext)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
  let name = `${base}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(dir, name))) {
    name = `${base}-${n}${ext}`;
    n += 1;
  }
  return name;
}

function mediaPath(kind, filename) {
  const dir  = kind === 'music' ? MUSIC_DIR : IMAGES_DIR;
  const base = path.basename(String(filename || ''));
  if (!base || base !== String(filename) || base.includes('..')) return null;
  const full = path.resolve(dir, base);
  const root = path.resolve(dir);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return { dir, base, full, kind };
}

async function readLimited(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      const err = new Error('File is too large (max 25 MB).');
      err.status = 400;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function parseMultipartFile(buffer, contentType) {
  const m = String(contentType || '').match(/multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m) {
    const err = new Error('Expected multipart form upload.');
    err.status = 400;
    throw err;
  }
  const boundary = (m[1] || m[2]).trim();
  const splitter = Buffer.from(`--${boundary}`);
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(splitter, offset);
    if (start === -1) break;
    let cursor = start + splitter.length;
    if (buffer[cursor] === 0x2d && buffer[cursor + 1] === 0x2d) break;
    if (buffer[cursor] === 0x0d && buffer[cursor + 1] === 0x0a) cursor += 2;
    const next = buffer.indexOf(splitter, cursor);
    if (next === -1) break;
    let part = buffer.subarray(cursor, next);
    if (part.length >= 2 && part[part.length - 2] === 0x0d && part[part.length - 1] === 0x0a) {
      part = part.subarray(0, part.length - 2);
    }
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep !== -1) {
      const header = part.subarray(0, sep).toString('utf8');
      const body   = part.subarray(sep + 4);
      const fileMatch = header.match(/filename\*=(?:UTF-8''|)([^;\r\n]+)/i)
        || header.match(/filename="((?:\\.|[^"\\])*)"/i)
        || header.match(/filename=([^;\r\n]+)/i);
      if (fileMatch) {
        let filename = (fileMatch[1] || '').trim().replace(/^"|"$/g, '').replace(/\\"/g, '"');
        try { filename = decodeURIComponent(filename); } catch { /* keep raw */ }
        if (filename) return { filename: path.basename(filename), buffer: body };
      }
    }
    offset = next;
  }
  const err = new Error('Choose a file to upload.');
  err.status = 400;
  throw err;
}

async function listMedia(dir, urlPrefix, extRe) {
  let names = [];
  try { names = await fsp.readdir(dir); }
  catch { return []; }
  const out = [];
  for (const name of names) {
    if (!extRe.test(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = await fsp.stat(full); }
    catch { continue; }
    if (!st.isFile()) continue;
    out.push({
      name,
      url:   `${urlPrefix}/${encodeURIComponent(name)}`,
      size:  st.size,
      mtime: st.mtime.toISOString(),
    });
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

router.post('/login', (req, res) => {
  const token = adminToken();
  if (!token) {
    return res.status(503).json({ error: 'ADMIN_TOKEN is not set on the server (minimum 8 characters).' });
  }
  const given = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!safeEqual(given, token)) {
    return res.status(401).json({ error: 'Invalid admin token.' });
  }
  res.setHeader('Set-Cookie', cookieHeader(signCookie(token), COOKIE_MAX));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', cookieHeader('', 0));
  res.json({ ok: true });
});

router.get('/session', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

router.use(requireAuth);

// ── Events ───────────────────────────────────────────────────────────────────

router.get('/events', (_req, res) => {
  const rows = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM quizzes q
         JOIN quiz_questions qq ON qq.quiz_id = q.id
        WHERE q.event_id = e.id) AS question_count,
      (SELECT COUNT(*) FROM score_submissions s WHERE s.event_id = e.id) AS score_count
    FROM events e
    ORDER BY e.updated_at DESC
  `).all();
  res.json(rows.map((row) => serializeEvent(row, {
    questionCount: row.question_count,
    scoreCount:    row.score_count,
  })));
});

router.post('/events', (req, res) => {
  const body = req.body || {};
  const name = str(body.name, 120);
  if (!name) return res.status(400).json({ error: 'Event name is required.' });

  const slugRes = readSlug(body.slug);
  if (slugRes.error) return res.status(400).json({ error: slugRes.error });
  if (db.prepare('SELECT id FROM events WHERE slug = ?').get(slugRes.slug)) {
    return res.status(409).json({ error: 'That slug is already in use.' });
  }

  const statusRes = readStatus(body.status, 'draft');
  if (statusRes.error) return res.status(400).json({ error: statusRes.error });

  const id     = uid();
  const theme  = readTheme(body.theme);
  const themeJ = JSON.stringify(theme);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO events
        (id, slug, name, occasion_type, event_date, status, theme_preset, theme_json,
         header_emoji, enable_quiz, enable_leaderboard)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      slugRes.slug,
      name,
      str(body.occasionType, 60, 'Birthday'),
      str(body.eventDate, 32, null),
      statusRes.status,
      str(body.themePreset, 40, 'custom'),
      themeJ,
      str(body.headerEmoji, 8, '🎉'),
      body.enableQuiz === false ? 0 : 1,
      body.enableLeaderboard === false ? 0 : 1,
    );
    ensureQuiz(id, name);
  });
  tx();

  const event = eventById(id);
  const quiz  = quizByEvent(id);
  res.status(201).json({ event: serializeEvent(event), quiz: serializeQuiz(quiz), questions: [] });
});

router.get('/events/:id', (req, res) => {
  const event = eventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const quiz = ensureQuiz(event.id, event.name);
  const questions = db.prepare(
    'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order'
  ).all(quiz.id);
  const scoreCount = db.prepare(
    'SELECT COUNT(*) AS n FROM score_submissions WHERE event_id = ?'
  ).get(event.id).n;
  res.json({
    event:      serializeEvent(event, { scoreCount, questionCount: questions.length }),
    quiz:       serializeQuiz(quiz),
    questions:  questions.map(serializeQuestion),
  });
});

router.put('/events/:id', (req, res) => {
  const event = eventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const body = req.body || {};
  const name = str(body.name, 120, event.name);
  if (!name) return res.status(400).json({ error: 'Event name is required.' });

  const slugRes = readSlug(body.slug ?? event.slug);
  if (slugRes.error) return res.status(400).json({ error: slugRes.error });
  const taken = db.prepare('SELECT id FROM events WHERE slug = ? AND id != ?').get(slugRes.slug, event.id);
  if (taken) return res.status(409).json({ error: 'That slug is already in use.' });

  const statusRes = readStatus(body.status, event.status);
  if (statusRes.error) return res.status(400).json({ error: statusRes.error });

  const theme  = body.theme !== undefined ? readTheme(body.theme) : parseJson(event.theme_json, {});
  const themeJ = JSON.stringify(theme);

  db.prepare(`
    UPDATE events SET
      slug = ?, name = ?, occasion_type = ?, event_date = ?, status = ?,
      theme_preset = ?, theme_json = ?, header_emoji = ?,
      enable_quiz = ?, enable_leaderboard = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    slugRes.slug,
    name,
    str(body.occasionType, 60, event.occasion_type),
    body.eventDate === undefined ? event.event_date : str(body.eventDate, 32, null),
    statusRes.status,
    str(body.themePreset, 40, event.theme_preset || 'custom'),
      themeJ,
      str(body.headerEmoji, 8, event.header_emoji || '🎉'),
      body.enableQuiz === undefined ? event.enable_quiz : (body.enableQuiz ? 1 : 0),
      body.enableLeaderboard === undefined ? event.enable_leaderboard : (body.enableLeaderboard ? 1 : 0),
      event.id,
  );

  // Keep quiz.theme_json in sync so public-config stays consistent.
  db.prepare('UPDATE quizzes SET theme_json = ? WHERE event_id = ?').run(themeJ, event.id);

  res.json({ event: serializeEvent(eventById(event.id)) });
});

router.delete('/events/:id', (req, res) => {
  const event = eventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  db.prepare('DELETE FROM events WHERE id = ?').run(event.id);
  res.json({ ok: true });
});

// ── Quiz copy ────────────────────────────────────────────────────────────────

router.put('/events/:id/quiz', (req, res) => {
  const event = eventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const quiz = ensureQuiz(event.id, event.name);
  const body = req.body || {};

  const title = str(body.title, 160, quiz.title);
  if (!title) return res.status(400).json({ error: 'Quiz title is required.' });

  const audio      = (body.audio && typeof body.audio === 'object') ? body.audio : parseJson(quiz.audio_json, {});
  const scoreTiers = Array.isArray(body.scoreTiers) ? body.scoreTiers : parseJson(quiz.score_tiers_json, []);
  const ecard      = (body.ecard && typeof body.ecard === 'object') ? body.ecard : parseJson(quiz.ecard_json, {});

  const cleanTiers = scoreTiers.map((t) => ({
    minPercent: Number.isFinite(t.minPercent) ? t.minPercent : 0,
    maxPercent: Number.isFinite(t.maxPercent) ? t.maxPercent : 100,
    title:      str(t.title, 80, ''),
    message:    str(t.message, 400, ''),
  }));

  const photos = Array.isArray(ecard.photos) ? ecard.photos.slice(0, 6).map((p) => ({
    src:     str(p?.src, 240, ''),
    caption: str(p?.caption, 80, ''),
  })) : [];

  const cleanEcard = {
    greeting:    str(ecard.greeting, 120, ''),
    subGreeting: str(ecard.subGreeting, 160, ''),
    message:     str(ecard.message, 800, ''),
    buttonText:  str(ecard.buttonText, 80, ''),
    photos,
  };

  const cleanAudio = {
    backgroundMusic: str(audio.backgroundMusic, 160, ''),
    correctSound:    str(audio.correctSound, 160, ''),
    wrongSound:      str(audio.wrongSound, 160, ''),
  };

  db.prepare(`
    UPDATE quizzes SET
      title = ?, subtitle = ?, honoree = ?, welcome_message = ?, hero_image = ?,
      audio_json = ?, score_tiers_json = ?, ecard_json = ?
    WHERE id = ?
  `).run(
    title,
    str(body.subtitle, 200, null),
    str(body.honoree, 80, null),
    str(body.welcomeMessage, 800, null),
    str(body.heroImage, 240, null),
    JSON.stringify(cleanAudio),
    JSON.stringify(cleanTiers),
    JSON.stringify(cleanEcard),
    quiz.id,
  );
  touchEvent(event.id);
  res.json({ quiz: serializeQuiz(quizByEvent(event.id)) });
});

// ── Questions ────────────────────────────────────────────────────────────────

function readQuestionBody(body, fallback = {}) {
  const question = str(body.question, 400, fallback.question);
  if (!question) return { error: 'Question text is required.' };

  let options = Array.isArray(body.options) ? body.options : parseJson(fallback.options_json, []);
  options = options.map((o) => String(o ?? '').trim()).filter(Boolean);
  if (options.length < 2) return { error: 'At least two answer options are required.' };
  if (options.length > 8) options = options.slice(0, 8);

  let correctIndex = Number(body.correctIndex ?? fallback.correct_index ?? 0);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    return { error: 'correctIndex must point at one of the options.' };
  }

  const type = str(body.type, 20, fallback.question_type || 'text') || 'text';
  return {
    submittedBy: str(body.submittedBy, 60, fallback.submitted_by || null),
    type:        type === 'photo' ? 'photo' : 'text',
    question,
    image:       str(body.image, 240, fallback.image_url || null),
    options,
    correctIndex,
    funFact:     str(body.funFact, 400, fallback.fun_fact || null),
    audioClip:   str(body.audioClip, 160, fallback.audio_clip || null),
  };
}

router.post('/events/:id/questions', (req, res) => {
  const event = eventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const quiz = ensureQuiz(event.id, event.name);
  const parsed = readQuestionBody(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const max = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS n FROM quiz_questions WHERE quiz_id = ?'
  ).get(quiz.id).n;
  const id = uid();
  db.prepare(`
    INSERT INTO quiz_questions
      (id, quiz_id, sort_order, submitted_by, question_type, question,
       image_url, options_json, correct_index, fun_fact, audio_clip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, quiz.id, max + 1, parsed.submittedBy, parsed.type, parsed.question,
    parsed.image, JSON.stringify(parsed.options), parsed.correctIndex,
    parsed.funFact, parsed.audioClip,
  );
  touchEvent(event.id);
  const row = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(id);
  res.status(201).json({ question: serializeQuestion(row) });
});

router.put('/events/:id/questions/reorder', (req, res) => {
  const event = eventById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  const quiz = quizByEvent(event.id);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const existing = db.prepare('SELECT id FROM quiz_questions WHERE quiz_id = ?').all(quiz.id).map((r) => r.id);
  if (ids.length !== existing.length || ids.some((id) => !existing.includes(id))) {
    return res.status(400).json({ error: 'Reorder list must include every question id exactly once.' });
  }

  const upd = db.prepare('UPDATE quiz_questions SET sort_order = ? WHERE id = ? AND quiz_id = ?');
  db.transaction((list) => list.forEach((id, i) => upd.run(i, id, quiz.id)))(ids);
  touchEvent(event.id);
  const questions = db.prepare(
    'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order'
  ).all(quiz.id);
  res.json({ questions: questions.map(serializeQuestion) });
});

router.put('/questions/:qid', (req, res) => {
  const row = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(req.params.qid);
  if (!row) return res.status(404).json({ error: 'Question not found.' });
  const parsed = readQuestionBody(req.body || {}, row);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  db.prepare(`
    UPDATE quiz_questions SET
      submitted_by = ?, question_type = ?, question = ?, image_url = ?,
      options_json = ?, correct_index = ?, fun_fact = ?, audio_clip = ?
    WHERE id = ?
  `).run(
    parsed.submittedBy, parsed.type, parsed.question, parsed.image,
    JSON.stringify(parsed.options), parsed.correctIndex, parsed.funFact,
    parsed.audioClip, row.id,
  );
  const quiz = db.prepare('SELECT event_id FROM quizzes WHERE id = ?').get(row.quiz_id);
  if (quiz) touchEvent(quiz.event_id);
  res.json({ question: serializeQuestion(db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(row.id)) });
});

router.delete('/questions/:qid', (req, res) => {
  const row = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(req.params.qid);
  if (!row) return res.status(404).json({ error: 'Question not found.' });
  db.prepare('DELETE FROM quiz_questions WHERE id = ?').run(row.id);
  const remaining = db.prepare(
    'SELECT id FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order'
  ).all(row.quiz_id);
  const upd = db.prepare('UPDATE quiz_questions SET sort_order = ? WHERE id = ?');
  remaining.forEach((q, i) => upd.run(i, q.id));
  const quiz = db.prepare('SELECT event_id FROM quizzes WHERE id = ?').get(row.quiz_id);
  if (quiz) touchEvent(quiz.event_id);
  res.json({ ok: true });
});

// ── Media (Docker volumes) ───────────────────────────────────────────────────

router.get('/media', async (_req, res) => {
  try {
    const [images, music] = await Promise.all([
      listMedia(IMAGES_DIR, '/images', /\.(jpe?g|png|gif|webp)$/i),
      listMedia(MUSIC_DIR,  '/music',  /\.mp3$/i),
    ]);
    res.json({ images, music });
  } catch (err) {
    console.error('GET media:', err);
    res.status(500).json({ error: 'Unable to list media.' });
  }
});

router.post('/media', async (req, res) => {
  try {
    const raw    = await readLimited(req, MAX_UPLOAD);
    const parsed = parseMultipartFile(raw, req.headers['content-type']);
    const kind   = req.query.kind === 'music' ? 'music' : 'image';
    const ext    = path.extname(parsed.filename).toLowerCase();
    if (kind === 'music' && ext !== '.mp3') {
      return res.status(400).json({ error: 'Only .mp3 files can be uploaded to the music volume.' });
    }
    if (kind === 'image' && !IMAGE_EXTS.has(ext)) {
      return res.status(400).json({ error: 'Images must be jpg, png, gif, or webp.' });
    }
    const dir  = kind === 'music' ? MUSIC_DIR : IMAGES_DIR;
    const name = uniqueFilename(dir, parsed.filename);
    await fsp.writeFile(path.join(dir, name), parsed.buffer);
    const url = kind === 'music'
      ? `/music/${encodeURIComponent(name)}`
      : `/images/${encodeURIComponent(name)}`;
    res.status(201).json({ kind, name, url, size: parsed.buffer.length });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('POST media:', err);
    res.status(status).json({ error: err.message || 'Upload failed.' });
  }
});

router.delete('/media/:kind/:filename', async (req, res) => {
  const kind = req.params.kind === 'music' ? 'music' : (req.params.kind === 'image' ? 'image' : null);
  if (!kind) return res.status(400).json({ error: 'Kind must be image or music.' });
  const loc = mediaPath(kind, req.params.filename);
  if (!loc) return res.status(400).json({ error: 'Invalid filename.' });
  try {
    await fsp.unlink(loc.full);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found.' });
    console.error('DELETE media:', err);
    res.status(500).json({ error: 'Unable to delete file.' });
  }
});

router.use((_req, res) => res.status(404).json({ error: 'Not found.' }));

module.exports = router;
