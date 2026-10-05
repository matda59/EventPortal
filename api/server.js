'use strict';

const path    = require('path');
const fsp     = require('fs/promises');
const crypto  = require('crypto');
const express = require('express');
const cors    = require('cors');
const db      = require('./db');

const admin = require('./admin');
const files = require('./files');
const guestbook = require('./guestbook');
const gallery = require('./gallery');

const app  = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR      = path.join(__dirname, '..', 'public');
const ADMIN_DIR       = path.join(__dirname, '..', 'admin');
const MUSIC_DIR       = path.join(PUBLIC_DIR, 'music');
const IMAGES_DIR      = path.join(PUBLIC_DIR, 'images');
const MAX_LEADERBOARD = 25;
const SESSION_TTL_MS  = 4 * 60 * 60 * 1000;
const NAME_MAX        = 30;

fsp.mkdir(IMAGES_DIR, { recursive: true }).catch(() => {});
fsp.mkdir(MUSIC_DIR,  { recursive: true }).catch(() => {});

app.set('trust proxy', 1);
app.use(cors());
app.use('/api/admin', admin);
app.use(express.json({ limit: '16kb' }));

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid(bytes = 10) { return crypto.randomBytes(bytes).toString('hex'); }

function parseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}

const THEME_PAIRS = [
  ['primaryRed', '--primary-red'],
  ['accentOrange', '--accent-orange'],
  ['highlightPink', '--highlight-pink'],
  ['bgEarth', '--bg-earth'],
  ['surfaceCard', '--surface-card'],
  ['textDark', '--text-dark'],
];

function normalizeTheme(raw) {
  const theme = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  for (const [camel, css] of THEME_PAIRS) {
    const val = theme[camel] || theme[css];
    if (val) {
      out[camel] = val;
      out[css] = val;
    }
  }
  return out;
}

function findEventBySlug(slug) {
  return db.prepare('SELECT * FROM events WHERE slug = ?').get(slug);
}

function findActiveEvent(slug) {
  return db.prepare("SELECT * FROM events WHERE slug = ? AND status = 'active'").get(slug);
}

function quizForEvent(eventId) {
  return db.prepare('SELECT * FROM quizzes WHERE event_id = ?').get(eventId);
}

function questionsForQuiz(quizId) {
  return db.prepare('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY sort_order').all(quizId);
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

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimit({ windowMs, max }) {
  const buckets = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of buckets) {
      const next = times.filter((t) => t > cutoff);
      if (next.length) buckets.set(ip, next);
      else buckets.delete(ip);
    }
  }, Math.min(windowMs, 60_000)).unref();

  return function limit(req, res, next) {
    const ip = clientIp(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const times = (buckets.get(ip) || []).filter((t) => t > cutoff);
    if (times.length >= max) {
      const retrySec = Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }
    times.push(now);
    buckets.set(ip, times);
    next();
  };
}

const limitSessions = rateLimit({ windowMs: 10 * 60 * 1000, max: 80 });
const limitAnswers  = rateLimit({ windowMs: 10 * 60 * 1000, max: 240 });
const limitScores   = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
const limitGuestbook = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 });
const limitGallery = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

function readPlayerName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().slice(0, NAME_MAX);
  return name || null;
}

function sessionAgeMs(row) {
  const created = Date.parse(String(row.created_at || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(created) ? Date.now() - created : Number.POSITIVE_INFINITY;
}

function isSessionExpired(row) {
  return sessionAgeMs(row) > SESSION_TTL_MS;
}

function getOpenSession(sessionId, eventId) {
  const session = db.prepare(
    'SELECT * FROM quiz_sessions WHERE id = ? AND event_id = ?'
  ).get(sessionId, eventId);
  if (!session) return { error: 'Quiz session not found.', status: 404 };
  if (isSessionExpired(session)) return { error: 'Quiz session expired. Start again.', status: 410 };
  return { session };
}

function safeMp3Name(value) {
  const base = path.basename(String(value || '').replace(/\\/g, '/'));
  if (!base || base.includes('..') || !/\.mp3$/i.test(base)) return null;
  return base;
}

function eventPlaylistNames(quiz) {
  const audio = parseJson(quiz?.audio_json, {});
  const names = [];
  const seen = new Set();
  const add = (value) => {
    const name = safeMp3Name(value);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  if (Array.isArray(audio.playlist)) audio.playlist.forEach(add);
  add(audio.backgroundMusic);
  return names;
}

function presentAudio(eventId, audio) {
  const src = (audio && typeof audio === 'object') ? audio : {};
  const playlist = Array.isArray(src.playlist) ? src.playlist : [];
  return {
    backgroundMusic: files.presentClip(eventId, src.backgroundMusic || ''),
    correctSound: files.presentClip(eventId, src.correctSound || ''),
    wrongSound: files.presentClip(eventId, src.wrongSound || ''),
    playlist: playlist.map((name) => files.presentClip(eventId, name)).filter(Boolean),
  };
}

function listExistingMp3s(eventId, names) {
  const out = [];
  const seen = new Set();
  for (const name of names) {
    const url = files.resolveMp3Url(eventId, name);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const insertAnswer = db.prepare(`
  INSERT INTO quiz_answers (session_id, question_id, selected_index, is_correct)
  VALUES (?, ?, ?, ?)
`);
const bumpSessionScore = db.prepare(`
  UPDATE quiz_sessions SET score = score + 1 WHERE id = ?
`);
const gradeAnswerTx = db.transaction((sessionId, questionId, selectedIndex, isCorrect) => {
  insertAnswer.run(sessionId, questionId, selectedIndex, isCorrect ? 1 : 0);
  if (isCorrect) bumpSessionScore.run(sessionId);
  return db.prepare('SELECT score, total_questions FROM quiz_sessions WHERE id = ?').get(sessionId);
});

const insertScore = db.prepare(`
  INSERT INTO score_submissions (id, event_id, player_name, score, total_questions, session_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const markSubmitted = db.prepare('UPDATE quiz_sessions SET submitted = 1 WHERE id = ?');
const submitScoreTx = db.transaction((session) => {
  insertScore.run(
    uid(), session.event_id, session.player_name,
    session.score, session.total_questions, session.id,
  );
  markSubmitted.run(session.id);
});

// ── Public event config ───────────────────────────────────────────────────────
//
// Returns everything the quiz SPA needs: theme, ecard, questions, score tiers.
// correctIndex is omitted — the browser grades via POST /sessions/:id/answers.

app.get('/api/events/:slug/public-config', (req, res) => {
  try {
    const event = findEventBySlug(req.params.slug);
    // Draft and missing look the same so unpublished slugs stay private.
    if (!event || event.status === 'draft') {
      return res.status(404).json({ error: 'Event not found or unavailable.' });
    }

    const quiz = quizForEvent(event.id);

    if (event.status === 'ended') {
      return res.json({
        meta: {
          title:          quiz?.title          ?? event.name,
          subtitle:       quiz?.subtitle       ?? null,
          honoree:        quiz?.honoree        ?? null,
          eventName:      event.name,
          description:    event.description || null,
          welcomeMessage: 'This event has ended. Thanks for celebrating with us.',
          heroImage:      quiz?.hero_image     ?? null,
          bgImage:        quiz?.hero_image     ?? null,
          occasionType:   event.occasion_type  || null,
          headerEmoji:    event.header_emoji   || null,
          theme:          normalizeTheme(parseJson(event.theme_json || quiz?.theme_json, {})),
        },
        ecard:      {},
        audio:      {},
        scoreTiers: [],
        questions:  [],
        flags: {
          enableQuiz:        false,
          enableLeaderboard: false,
          enableGallery:     false,
          enableMusic:       false,
          enableGuestbook:   false,
          status:            'ended',
        },
      });
    }

    const questions = quiz ? questionsForQuiz(quiz.id) : [];

    res.json({
      meta: {
        title:          quiz?.title          ?? event.name,
        subtitle:       quiz?.subtitle       ?? null,
        honoree:        quiz?.honoree        ?? null,
        eventName:      event.name,
        description:    event.description || null,
        eventDate:      event.event_date  || null,
        welcomeMessage: quiz?.welcome_message ?? null,
        heroImage:      quiz?.hero_image     ?? null,
        bgImage:        quiz?.hero_image     ?? null,
        occasionType:   event.occasion_type  || null,
        headerEmoji:    event.header_emoji   || null,
        theme:          normalizeTheme(parseJson(event.theme_json || quiz?.theme_json, {})),
      },
      ecard:      parseJson(quiz?.ecard_json, {}),
      audio:      presentAudio(event.id, parseJson(quiz?.audio_json, {})),
      scoreTiers: parseJson(quiz?.score_tiers_json, []),
      questions:  event.enable_quiz ? questions.map((q) => ({
        id:          q.id,
        submittedBy: q.submitted_by,
        type:        q.question_type,
        question:    q.question,
        image:       q.image_url || null,
        options:     parseJson(q.options_json, []),
        funFact:     q.fun_fact   || null,
        audioClip:   files.presentClip(event.id, q.audio_clip || null),
      })) : [],
      flags: {
        enableQuiz:        !!event.enable_quiz,
        enableLeaderboard: !!event.enable_leaderboard,
        enableGallery:     event.enable_gallery == null ? true : !!event.enable_gallery,
        enableMusic:       event.enable_music == null ? true : !!event.enable_music,
        enableGuestbook:   !!event.enable_guestbook,
        status:            'active',
      },
    });
  } catch (err) {
    console.error('GET public-config:', err);
    res.status(500).json({ error: 'Unable to load event config.' });
  }
});

// ── Quiz session: start ───────────────────────────────────────────────────────

app.post('/api/events/:slug/sessions', limitSessions, (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.enable_quiz) return res.status(403).json({ error: 'Quiz is not enabled for this event.' });

    const name = readPlayerName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'A valid name is required.' });

    const quiz = quizForEvent(event.id);
    const questions = quiz ? questionsForQuiz(quiz.id) : [];
    if (!questions.length) return res.status(400).json({ error: 'This quiz has no questions yet.' });

    const id = uid(18);
    db.prepare(`
      INSERT INTO quiz_sessions
        (id, event_id, player_name, question_ids_json, score, total_questions)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(id, event.id, name, JSON.stringify(questions.map((q) => q.id)), questions.length);

    res.status(201).json({ sessionId: id, totalQuestions: questions.length });
  } catch (err) {
    console.error('POST sessions:', err);
    res.status(500).json({ error: 'Unable to start quiz.' });
  }
});

// ── Quiz session: grade one answer ────────────────────────────────────────────

app.post('/api/events/:slug/sessions/:id/answers', limitAnswers, (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const opened = getOpenSession(req.params.id, event.id);
    if (opened.error) return res.status(opened.status).json({ error: opened.error });
    const session = opened.session;
    if (session.submitted) {
      return res.status(409).json({ error: 'This quiz has already been submitted.' });
    }

    const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId : '';
    const selectedIndex = Number(req.body?.selectedIndex);
    if (!questionId) return res.status(400).json({ error: 'questionId is required.' });
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return res.status(400).json({ error: 'selectedIndex must be a non-negative integer.' });
    }

    const allowedIds = parseJson(session.question_ids_json, []);
    if (!allowedIds.includes(questionId)) {
      return res.status(400).json({ error: 'Question is not part of this quiz session.' });
    }

    const question = db.prepare(`
      SELECT qq.* FROM quiz_questions qq
      JOIN quizzes qz ON qz.id = qq.quiz_id
      WHERE qq.id = ? AND qz.event_id = ?
    `).get(questionId, event.id);
    if (!question) return res.status(400).json({ error: 'Question not found.' });

    const options = parseJson(question.options_json, []);
    if (selectedIndex >= options.length) {
      return res.status(400).json({ error: 'selectedIndex is out of range.' });
    }

    const existing = db.prepare(
      'SELECT selected_index, is_correct FROM quiz_answers WHERE session_id = ? AND question_id = ?'
    ).get(session.id, questionId);

    if (existing) {
      return res.json({
        correct:      !!existing.is_correct,
        correctIndex: question.correct_index,
        score:        session.score,
        totalQuestions: session.total_questions,
      });
    }

    const isCorrect = selectedIndex === question.correct_index;
    const updated = gradeAnswerTx(session.id, questionId, selectedIndex, isCorrect);
    res.json({
      correct:        isCorrect,
      correctIndex:   question.correct_index,
      score:          updated.score,
      totalQuestions: updated.total_questions,
    });
  } catch (err) {
    console.error('POST answers:', err);
    res.status(500).json({ error: 'Unable to grade answer.' });
  }
});

// ── Leaderboard: GET ──────────────────────────────────────────────────────────

app.get('/api/events/:slug/scores', (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event)                    return res.status(404).json({ error: 'Event not found.' });
    if (!event.enable_leaderboard) return res.status(403).json({ error: 'Leaderboard not enabled.' });
    res.json(rankAndFormat(fetchScores(event.id)));
  } catch (err) {
    console.error('GET scores:', err);
    res.status(500).json({ error: 'Unable to read scores.' });
  }
});

// ── Leaderboard: POST (session-bound, server-graded) ──────────────────────────

app.post('/api/events/:slug/scores', limitScores, (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event)                    return res.status(404).json({ error: 'Event not found.' });
    if (!event.enable_leaderboard) return res.status(403).json({ error: 'Leaderboard not enabled.' });

    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required.' });

    const opened = getOpenSession(sessionId, event.id);
    if (opened.error) return res.status(opened.status).json({ error: opened.error });
    const session = opened.session;

    if (session.submitted) {
      return res.json(rankAndFormat(fetchScores(event.id)));
    }

    const answered = db.prepare(
      'SELECT COUNT(*) AS n FROM quiz_answers WHERE session_id = ?'
    ).get(session.id).n;
    if (answered !== session.total_questions) {
      return res.status(400).json({ error: 'Finish every question before submitting a score.' });
    }

    try {
      submitScoreTx(session);
    } catch (err) {
      if (err && String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
        return res.json(rankAndFormat(fetchScores(event.id)));
      }
      throw err;
    }

    res.status(201).json(rankAndFormat(fetchScores(event.id)));
  } catch (err) {
    console.error('POST scores:', err);
    res.status(500).json({ error: 'Unable to save score.' });
  }
});

// ── Music listing (event-scoped) ──────────────────────────────────────────────

app.get('/api/events/:slug/music', async (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (event.enable_music === 0) return res.json([]);
    const quiz = quizForEvent(event.id);
    res.json(listExistingMp3s(event.id, eventPlaylistNames(quiz)));
  } catch (err) {
    console.error('GET music:', err);
    res.json([]);
  }
});

const GUESTBOOK_MSG_MAX = 280;

app.get('/api/events/:slug/guestbook', (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.enable_guestbook) return res.status(403).json({ error: 'Guest book is not enabled.' });
    res.json({ entries: guestbook.serialize(guestbook.list(event.id)) });
  } catch (err) {
    console.error('GET guestbook:', err);
    res.status(500).json({ error: 'Unable to read guest book.' });
  }
});

function galleryEnabled(event) {
  return event.enable_gallery == null ? true : !!event.enable_gallery;
}

function hostGalleryItems(event) {
  const quiz = quizForEvent(event.id);
  const ecard = parseJson(quiz?.ecard_json, {});
  const photos = Array.isArray(ecard.photos) ? ecard.photos : [];
  return photos.filter((p) => p && p.src).map((p) => ({
    src: p.src,
    caption: p.caption || '',
    name: '',
    guest: false,
  }));
}

async function galleryPayload(event) {
  const guests = [];
  const seen = new Set();
  for (const row of gallery.list(event.id)) {
    const name = files.safeFileName(row.filename);
    if (!name || !files.IMAGE_RE.test(name)) continue;
    const dir = files.eventMediaDir('image', event.id);
    if (!dir) continue;
    try {
      const st = await fsp.stat(path.join(dir, name));
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    const src = `/images/${event.id}/${encodeURIComponent(name)}`;
    seen.add(src);
    guests.push({
      src,
      caption: row.caption || '',
      name: row.guest_name || '',
      guest: true,
    });
  }
  const hosts = hostGalleryItems(event).filter((item) => item.src && !seen.has(item.src));
  return { items: guests.concat(hosts) };
}

app.get('/api/events/:slug/gallery', async (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!galleryEnabled(event)) return res.status(403).json({ error: 'Gallery is not enabled.' });
    res.json(await galleryPayload(event));
  } catch (err) {
    console.error('GET gallery:', err);
    res.status(500).json({ error: 'Unable to read gallery.' });
  }
});

app.post('/api/events/:slug/gallery', limitGallery, async (req, res) => {
  let written = null;
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!galleryEnabled(event)) return res.status(403).json({ error: 'Gallery is not enabled.' });
    if (gallery.count(event.id) >= gallery.MAX_ENTRIES) {
      return res.status(400).json({ error: 'This gallery is full.' });
    }

    const raw = await files.readLimited(req, 25 * 1024 * 1024);
    const parsed = files.parseMultipartFile(raw, req.headers['content-type']);
    const name = readPlayerName(parsed.fields && parsed.fields.name);
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    const caption = typeof parsed.fields?.caption === 'string'
      ? parsed.fields.caption.trim().slice(0, 80)
      : '';
    const ext = path.extname(parsed.filename).toLowerCase();
    if (!files.IMAGE_EXTS.has(ext)) {
      return res.status(400).json({ error: 'Photos and videos must be jpg, png, gif, webp, mp4, or webm.' });
    }

    const dir = files.eventMediaDir('image', event.id);
    if (!dir) return res.status(400).json({ error: 'Invalid event.' });
    await fsp.mkdir(dir, { recursive: true });
    const filename = files.uniqueFilename(dir, parsed.filename);
    written = path.join(dir, filename);
    await fsp.writeFile(written, parsed.buffer);
    gallery.add(uid(), event.id, name, caption, filename);
    written = null;
    res.status(201).json(await galleryPayload(event));
  } catch (err) {
    if (written) await fsp.unlink(written).catch(() => {});
    const status = err.status || 500;
    if (status >= 500) console.error('POST gallery:', err);
    const message = status >= 500 ? 'Unable to save gallery upload.' : (err.message || 'Upload failed.');
    res.status(status).json({ error: message });
  }
});

const AVATAR_MAX_BYTES = 400 * 1024;

function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  const head = buf.subarray(0, 6).toString('ascii');
  if (head === 'GIF87a' || head === 'GIF89a') return '.gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
  return null;
}

async function storeAvatarUpload(eventId, buffer) {
  const ext = sniffImageExt(buffer);
  if (!ext) {
    const err = new Error('Emoticon must be a png, jpg, gif, or webp.');
    err.status = 400;
    throw err;
  }
  const dir = files.eventMediaDir('image', eventId);
  if (!dir) {
    const err = new Error('Invalid event.');
    err.status = 400;
    throw err;
  }
  const avatarDir = path.join(dir, 'avatars');
  await fsp.mkdir(avatarDir, { recursive: true });
  const filename = `avatar-${uid()}${ext}`;
  await fsp.writeFile(path.join(avatarDir, filename), buffer);
  return `/images/${eventId}/avatars/${filename}`;
}

app.post('/api/events/:slug/guestbook', limitGuestbook, async (req, res) => {
  try {
    const event = findActiveEvent(req.params.slug);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    if (!event.enable_guestbook) return res.status(403).json({ error: 'Guest book is not enabled.' });

    let name;
    let message;
    let avatar = '';
    const type = String(req.headers['content-type'] || '');
    if (/multipart\/form-data/i.test(type)) {
      const raw = await files.readLimited(req, AVATAR_MAX_BYTES, 'Emoticon must be under 400 KB.');
      const parsed = files.parseMultipartFile(raw, type);
      name = readPlayerName(parsed.fields && parsed.fields.name);
      message = typeof parsed.fields?.message === 'string'
        ? parsed.fields.message.trim().slice(0, GUESTBOOK_MSG_MAX)
        : '';
      avatar = await storeAvatarUpload(event.id, parsed.buffer);
    } else {
      name = readPlayerName(req.body?.name);
      message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, GUESTBOOK_MSG_MAX) : '';
      avatar = guestbook.cleanAvatar(req.body?.avatar);
    }
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!message) return res.status(400).json({ error: 'Please write a short message.' });

    guestbook.add(uid(), event.id, name, message, avatar);
    res.status(201).json({ entries: guestbook.serialize(guestbook.list(event.id)) });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('POST guestbook:', err);
    const message = status >= 500 ? 'Unable to save guest book entry.' : (err.message || 'Could not save your message.');
    res.status(status).json({ error: message });
  }
});

app.get('/api/music', (_req, res) => {
  res.status(404).json({ error: 'Use /api/events/:slug/music' });
});

const GIT_SHA = process.env.GIT_SHA || 'dev';
const ASSET_V = GIT_SHA.slice(0, 7);

app.get('/api/version', (_req, res) => {
  res.json({ name: 'event-portal', sha: GIT_SHA });
});

async function sendHtml(file, req, res) {
  try {
    let html = await fsp.readFile(file, 'utf8');
    html = html.replace(/(href|src)="([^"]+\.(?:css|js))"/g, `$1="$2?v=${ASSET_V}"`);
    res.type('html').send(html);
  } catch (err) {
    console.error('sendHtml:', err);
    res.status(500).type('text').send('Unable to load page.');
  }
}

function noCacheAssets(_req, res, next) {
  res.setHeader('Cache-Control', 'no-cache');
  next();
}

// ── Static files ──────────────────────────────────────────────────────────────
// index:false so public/index.html is not served at /. The quiz SPA is /e/:slug only.

app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders(res, filePath) {
    if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('/e/:slug', (req, res) => sendHtml(path.join(PUBLIC_DIR, 'index.html'), req, res));

app.use('/admin', noCacheAssets, express.static(ADMIN_DIR, {
  index: false,
  setHeaders(res, filePath) {
    if (/\.(js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get(/^\/admin(\/.*)?$/, (req, res) => sendHtml(path.join(ADMIN_DIR, 'index.html'), req, res));

app.get('/', (_req, res) => res.redirect(302, '/admin'));

// Catch-all API 404
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ── Boot ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Event portal running → http://localhost:${PORT}`);
  console.log(`  Admin dashboard    → http://localhost:${PORT}/admin`);
  console.log(`  Public quiz        → http://localhost:${PORT}/e/<slug>`);
  console.log(`  Build              → ${GIT_SHA}`);
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length < 8) {
    console.warn('  ADMIN_TOKEN is not set — /admin login will be unavailable.');
  }
});
