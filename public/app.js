/* =====================================================================
   Event Portal — Quiz Engine Frontend
   Generic, data-driven. Reads event slug from URL: /e/naomi40th
   All content comes from /api/events/:slug/public-config
   ===================================================================== */

(function () {
  'use strict';

  // Derive event slug from URL path: /e/<slug>
  const pathParts  = window.location.pathname.replace(/^\/+/, '').split('/');
  const EVENT_SLUG = pathParts[1] || 'naomi40th'; // pathParts[0] = 'e'

  const CONFIG_URL   = `/api/events/${EVENT_SLUG}/public-config`;
  const SCORES_URL   = `/api/events/${EVENT_SLUG}/scores`;
  const SESSIONS_URL = `/api/events/${EVENT_SLUG}/sessions`;
  const MUSIC_URL    = `/api/events/${EVENT_SLUG}/music`;

  // ── App state ──────────────────────────────────────────────────────
  const state = {
    config: null,
    questions: [],
    current: 0,
    score: 0,
    selectedIndex: null,
    answered: false,
    grading: false,
    playerName: '',
    sessionId: null,
  };

  // ── Element cache ──────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const screens = {
    ecard:   $('screen-ecard'),
    welcome: $('screen-welcome'),
    quiz:    $('screen-quiz'),
    results: $('screen-results')
  };

  // ── Utilities ──────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function guestFlags() {
    const f = (state.config && state.config.flags) || {};
    return {
      enableQuiz:        f.enableQuiz !== false,
      enableLeaderboard: f.enableLeaderboard !== false,
      enableGallery:     f.enableGallery !== false,
      enableMusic:       f.enableMusic !== false,
      status:            f.status || 'active',
    };
  }

  function showUnavailable({ title, subtitle, message, heroImage }) {
    document.title = title;
    $('welcome-title').textContent    = title;
    $('welcome-subtitle').textContent = subtitle || '';
    $('welcome-message').textContent  = message || '';
    $('name-form').hidden = true;
    const hero = $('welcome-hero');
    if (heroImage) {
      hero.src    = heroImage;
      hero.alt    = title || '';
      hero.hidden = false;
      hero.onerror = () => { hero.hidden = true; };
    } else {
      hero.hidden = true;
      hero.removeAttribute('src');
    }
    showScreen('welcome');
  }

  function applyGuestFlags() {
    const f = guestFlags();
    $('name-form').hidden       = !f.enableQuiz;
    $('hall-of-fame').hidden    = !f.enableLeaderboard;
    $('play-again-btn').hidden  = !f.enableQuiz;
  }

  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement.style;
    if (theme.primaryRed)    root.setProperty('--primary-red',    theme.primaryRed);
    if (theme.accentOrange)  root.setProperty('--accent-orange',  theme.accentOrange);
    if (theme.highlightPink) root.setProperty('--highlight-pink', theme.highlightPink);
    if (theme.bgEarth)       root.setProperty('--bg-earth',       theme.bgEarth);
    if (theme.surfaceCard)   root.setProperty('--surface-card',   theme.surfaceCard);
    if (theme.textDark)      root.setProperty('--text-dark',      theme.textDark);
    const color = theme.primaryRed || theme.accentOrange;
    if (color) {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      meta.content = color;
    }
  }

  function occasionKey(type) {
    return String(type || '').trim().toLowerCase();
  }

  function occasionCopy(meta) {
    const honoree = (meta && meta.honoree) || '';
    const key = occasionKey(meta && meta.occasionType);
    const table = {
      birthday: {
        greeting: honoree ? `Happy Birthday, ${honoree}!` : 'Happy Birthday!',
        confetti: '🎈🎉🥂🎂🎈',
        music: 'Party tunes',
      },
      wedding: {
        greeting: honoree ? `Congratulations, ${honoree}!` : 'Congratulations!',
        confetti: '💐💍🥂✨💐',
        music: 'Playlist',
      },
      retirement: {
        greeting: honoree ? `Happy retirement, ${honoree}!` : 'Happy retirement!',
        confetti: '🌅🎉🥂⛳',
        music: 'Playlist',
      },
      'kids party': {
        greeting: honoree ? `Let's celebrate, ${honoree}!` : "Let's celebrate!",
        confetti: '🎈🦄🌈⭐🎈',
        music: 'Playlist',
      },
      anniversary: {
        greeting: honoree ? `Happy anniversary, ${honoree}!` : 'Happy anniversary!',
        confetti: '💕🥂✨🌹💕',
        music: 'Playlist',
      },
      holiday: {
        greeting: honoree ? `Happy holidays, ${honoree}!` : 'Happy holidays!',
        confetti: '❄️🎄✨🎁❄️',
        music: 'Playlist',
      },
    };
    return table[key] || {
      greeting: honoree ? `Welcome, ${honoree}!` : 'Welcome!',
      confetti: '✨🎉✨',
      music: 'Playlist',
    };
  }

  function hasEcard(ecard) {
    if (!ecard || typeof ecard !== 'object') return false;
    if (ecard.greeting || ecard.subGreeting || ecard.message || ecard.buttonText) return true;
    if (!guestFlags().enableGallery) return false;
    return Array.isArray(ecard.photos) && ecard.photos.some((p) => p && (p.src || p.caption));
  }

  // ── Load config ────────────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch(CONFIG_URL);
      if (res.status === 404) {
        showUnavailable({
          title:   'Event not found',
          message: 'This event link may be invalid or is not available yet.',
        });
        setupMp3Player();
        return;
      }
      if (!res.ok) throw new Error(`Config not found (${res.status})`);
      state.config = await res.json();
    } catch (err) {
      showUnavailable({
        title:   'Event not found',
        message: 'This event link may be invalid or the event has ended.',
      });
      setupMp3Player();
      console.error(err);
      return;
    }

    const meta = state.config.meta || {};
    const f    = guestFlags();
    const copy = occasionCopy(meta);
    applyTheme(meta.theme);
    document.title = meta.title || (f.status === 'ended' ? 'Event ended' : 'Quiz');
    const musicLabel = $('mp3-label');
    if (musicLabel) musicLabel.textContent = copy.music;

    if (f.status === 'ended') {
      showUnavailable({
        title:     meta.title || 'This event has ended',
        subtitle:  meta.subtitle || '',
        message:   meta.welcomeMessage || 'This event has ended. Thanks for celebrating with us.',
        heroImage: meta.heroImage,
      });
      setupMp3Player();
      return;
    }

    $('welcome-title').textContent    = meta.title          || 'Quiz';
    $('welcome-subtitle').textContent = meta.subtitle       || '';
    $('welcome-message').textContent  = meta.welcomeMessage || '';

    if (meta.heroImage) {
      const hero = $('welcome-hero');
      hero.src    = meta.heroImage;
      hero.alt    = meta.honoree ? `Photo of ${meta.honoree}` : '';
      hero.hidden = false;
      hero.onerror = () => { hero.hidden = true; };
    }

    state.questions = Array.isArray(state.config.questions) ? state.config.questions : [];
    applyGuestFlags();
    setupMp3Player();
    wireEvents();

    const ecard = state.config.ecard || {};
    if (hasEcard(ecard)) {
      renderEcard(ecard, meta);
      showScreen('ecard');
    } else {
      showScreen('welcome');
    }
  }

  // ── E-Card intro + floating photo board ────────────────────────────
  function renderEcard(ecard, meta) {
    const copy = occasionCopy(meta);
    $('ecard-confetti').textContent = ecard.confetti || copy.confetti;
    $('ecard-greeting').textContent = ecard.greeting  || copy.greeting;
    $('ecard-sub').textContent      = ecard.subGreeting || '';
    $('ecard-message').textContent  = ecard.message    || meta.welcomeMessage || '';
    $('ecard-start').textContent    = ecard.buttonText
      || (guestFlags().enableQuiz ? 'Start the Quiz →' : 'Continue →');
    const label = $('mp3-label');
    if (label) label.textContent = copy.music;
    buildPhotoBoard(guestFlags().enableGallery && Array.isArray(ecard.photos) ? ecard.photos : []);
  }

  function buildPhotoBoard(photos) {
    const board = $('photo-board');
    board.innerHTML = '';
    photos.slice(0, 6).forEach((p, i) => {
      const fig     = document.createElement('figure');
      fig.className = `polaroid pos-${i + 1}`;
      const caption = p && p.caption ? escHtml(p.caption) : '';
      const img     = p && p.src
        ? `<img src="${escHtml(p.src)}" alt="${caption}" onerror="this.style.display='none'">`
        : '';
      fig.innerHTML =
        `<div class="polaroid-photo">${img}</div>` +
        (caption ? `<figcaption>${caption}</figcaption>` : '');
      board.appendChild(fig);
    });
  }

  // ── Welcome / name entry ───────────────────────────────────────────
  function wireEvents() {
    $('ecard-start').addEventListener('click', () => {
      showScreen('welcome');
      if (guestFlags().enableQuiz) setTimeout(() => $('player-name').focus(), 300);
    });

    $('name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('player-name').value.trim();
      if (!name) {
        $('name-error').textContent = 'Please enter your name to start.';
        $('name-error').hidden = false;
        $('player-name').focus();
        return;
      }
      $('name-error').hidden = true;
      state.playerName = name;
      startQuiz();
    });

    $('player-name').addEventListener('input', () => {
      if ($('player-name').value.trim()) $('name-error').hidden = true;
    });

    $('next-btn').addEventListener('click', onNext);
    $('play-again-btn').addEventListener('click', resetAndRestart);
  }

  function showQuizError(msg) {
    let el = $('quiz-error');
    if (!el) {
      el = document.createElement('p');
      el.id = 'quiz-error';
      el.className = 'error-text';
      el.setAttribute('role', 'alert');
      $('screen-quiz').insertBefore(el, $('next-btn'));
    }
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  async function apiJson(url, options) {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ── Quiz flow ──────────────────────────────────────────────────────
  async function startQuiz() {
    try {
      const started = await apiJson(SESSIONS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: state.playerName }),
      });
      state.sessionId = started.sessionId;
      state.current   = 0;
      state.score     = 0;
      const bg = state.config.audio && state.config.audio.backgroundMusic;
      if (bg) window.playAudioTrack(bg);
      showQuizError('');
      showScreen('quiz');
      renderQuestion();
    } catch (err) {
      $('name-error').textContent = err.message || 'Could not start the quiz.';
      $('name-error').hidden = false;
    }
  }

  function renderQuestion() {
    const q     = state.questions[state.current];
    const total = state.questions.length;
    state.selectedIndex = null;
    state.answered      = false;
    state.grading       = false;
    showQuizError('');

    $('progress-label').textContent = `Question ${state.current + 1} of ${total}`;
    $('progress-by').textContent    = q.submittedBy ? `Asked by ${q.submittedBy}` : '';
    $('progress-fill').style.width  = `${(state.current / total) * 100}%`;

    const img = $('question-image');
    if (q.image) {
      img.src = q.image; img.alt = q.question || ''; img.hidden = false;
      img.onerror = () => { img.hidden = true; };
    } else {
      img.hidden = true; img.removeAttribute('src');
    }

    $('question-text').textContent = q.question || '';

    const optionsEl = $('options');
    optionsEl.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    (q.options || []).forEach((opt, i) => {
      const btn       = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'option';
      btn.innerHTML   = `<span class="marker">${letters[i] || i + 1}</span><span>${escHtml(opt)}</span>`;
      btn.addEventListener('click', () => selectOption(i));
      optionsEl.appendChild(btn);
    });

    const anim = $('question-anim');
    anim.classList.remove('swap');
    void anim.offsetWidth;
    anim.classList.add('swap');

    const nextBtn = $('next-btn');
    nextBtn.disabled    = true;
    nextBtn.textContent = state.current === total - 1 ? 'See Results →' : 'Next';
  }

  async function selectOption(index) {
    if (state.answered || state.grading) return;
    state.grading       = true;
    state.selectedIndex = index;
    showQuizError('');

    const q         = state.questions[state.current];
    const optionEls = Array.from($('options').children);
    optionEls.forEach((el, i) => {
      el.disabled = true;
      if (i === index) el.classList.add('selected');
    });

    try {
      const result = await apiJson(`${SESSIONS_URL}/${encodeURIComponent(state.sessionId)}/answers`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ questionId: q.id, selectedIndex: index }),
      });
      state.answered = true;
      if (Number.isFinite(result.score)) state.score = result.score;

      optionEls.forEach((el, i) => {
        if (i === result.correctIndex) el.classList.add('correct');
        if (i === index && i !== result.correctIndex) el.classList.add('wrong');
      });

      if (result.correct) playCue(q, 'correct');
      else                playCue(q, 'wrong');

      if (q.funFact) {
        const fact       = document.createElement('p');
        fact.className   = 'fun-fact';
        fact.textContent = `💡 ${q.funFact}`;
        $('question-anim').appendChild(fact);
      }

      $('next-btn').disabled = false;
    } catch (err) {
      optionEls.forEach((el) => {
        el.disabled = false;
        el.classList.remove('selected');
      });
      showQuizError(err.message || 'Could not grade that answer. Try again.');
    } finally {
      state.grading = false;
    }
  }

  function playCue(question, kind) {
    const audio = state.config.audio || {};
    let src = question.audioClip;
    if (!src) src = kind === 'correct' ? audio.correctSound : audio.wrongSound;
    if (src) window.playSoundEffect(src);
  }

  function onNext() {
    if (!state.answered) return;
    if (state.current < state.questions.length - 1) {
      state.current += 1;
      renderQuestion();
    } else {
      showResults();
    }
  }

  // ── Results & Hall of Fame ─────────────────────────────────────────
  function pickTier(percent) {
    const tiers = state.config.scoreTiers || [];
    return tiers.find((t) => percent >= t.minPercent && percent <= t.maxPercent)
      || tiers[tiers.length - 1]
      || { title: 'Complete!', message: '' };
  }

  async function showResults() {
    const total   = state.questions.length;
    const percent = total ? Math.round((state.score / total) * 100) : 0;
    const tier    = pickTier(percent);

    $('progress-fill').style.width    = '100%';
    $('tier-title').textContent       = tier.title;
    $('tier-message').textContent     = tier.message;
    $('score-percent').textContent    = `${percent}%`;
    $('score-raw').textContent        = `${state.score} / ${total}`;
    document.querySelector('.score-ring').style.setProperty('--ring-pct', `${percent}%`);

    showScreen('results');
    if (guestFlags().enableLeaderboard) {
      $('hall-of-fame').hidden = false;
      await submitScore(total);
    } else {
      $('hall-of-fame').hidden = true;
    }
  }

  async function submitScore(_total) {
    try {
      const rows = await apiJson(SCORES_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: state.sessionId }),
      });
      renderHallOfFame(rows);
    } catch {
      try {
        const res = await fetch(SCORES_URL);
        renderHallOfFame(res.ok ? await res.json() : []);
      } catch { renderHallOfFame([]); }
    }
  }

  function renderHallOfFame(scores) {
    const container = $('hof-rows');
    if (!Array.isArray(scores) || scores.length === 0) {
      container.innerHTML = '<div class="hof-empty">No scores yet — be the first!</div>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    let youHighlighted = false;
    container.innerHTML = scores.map((s, i) => {
      const pct   = s.totalQuestions ? Math.round((s.score / s.totalQuestions) * 100) : 0;
      const rank  = medals[i] || `#${i + 1}`;
      const isYou = !youHighlighted && s.name === state.playerName && s.score === state.score;
      if (isYou) youHighlighted = true;
      return `
        <div class="hof-row${isYou ? ' is-you' : ''}">
          <div class="hof-rank">${rank}</div>
          <div class="hof-name">${escHtml(s.name)}${isYou ? '<span class="you-tag">YOU</span>' : ''}</div>
          <div class="hof-score">${pct}%<small>${s.score}/${s.totalQuestions}</small></div>
        </div>`;
    }).join('');
  }

  function resetAndRestart() {
    $('player-name').value = '';
    state.playerName = '';
    state.sessionId  = null;
    state.current    = 0;
    state.score      = 0;
    showScreen('welcome');
  }

  // ── MP3 Player ─────────────────────────────────────────────────────
  const mp3 = { tracks: [], index: 0, playing: false, volume: 0.3, audio: null, open: true };

  function mp3TrackUrl(name) {
    if (/^(https?:)?\//.test(name)) return name;
    return '/music/' + encodeURIComponent(name);
  }

  async function setupMp3Player() {
    if (!guestFlags().enableMusic) {
      mp3.tracks = [];
      $('mp3-player').hidden = true;
      return;
    }
    try {
      const res  = await fetch(MUSIC_URL);
      const files = res.ok ? await res.json() : [];
      mp3.tracks  = files.map((f) => ({
        name: f.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' '),
        url:  mp3TrackUrl(f),
      }));
    } catch { mp3.tracks = []; }

    $('mp3-player').hidden = !mp3.tracks.length;
    updateMp3Label();
    $('mp3-toggle').addEventListener('click', () => {
      mp3.open = !mp3.open;
      $('mp3-panel').style.display  = mp3.open ? 'block' : 'none';
      $('mp3-chevron').textContent  = mp3.open ? '▲' : '▼';
    });
    $('mp3-play').addEventListener('click', toggleMp3);
    $('mp3-next').addEventListener('click', () => startMp3(mp3.index + 1));
    $('mp3-prev').addEventListener('click', () => startMp3(mp3.index - 1));
    $('mp3-volume').addEventListener('input', (e) => {
      mp3.volume = parseFloat(e.target.value);
      if (mp3.audio) mp3.audio.volume = mp3.volume;
    });
  }

  function startMp3(idx) {
    if (!mp3.tracks.length) return;
    const n    = mp3.tracks.length;
    mp3.index  = ((idx % n) + n) % n;
    if (mp3.audio) { mp3.audio.pause(); mp3.audio.onended = null; }
    mp3.audio          = new Audio(mp3.tracks[mp3.index].url);
    mp3.audio.volume   = mp3.volume;
    mp3.audio.onended  = () => startMp3(mp3.index + 1);
    mp3.playing        = true;
    mp3.audio.play().catch(() => {});
    updateMp3Label();
  }

  function toggleMp3() {
    if (!mp3.tracks.length) return;
    if (mp3.playing) { mp3.playing = false; if (mp3.audio) mp3.audio.pause(); }
    else if (mp3.audio && mp3.audio.paused) { mp3.playing = true; mp3.audio.play().catch(() => {}); }
    else { startMp3(mp3.index); }
    updateMp3Label();
  }

  function updateMp3Label() {
    $('mp3-track').textContent = mp3.tracks.length ? mp3.tracks[mp3.index].name : 'No tracks available';
    $('mp3-emoji').classList.toggle('spin', mp3.playing);
    $('mp3-play').textContent = mp3.playing ? '⏸' : '▶';
  }

  window.playAudioTrack = function (src) {
    if (!src) return;
    const url      = mp3TrackUrl(src);
    const existing = mp3.tracks.findIndex((t) => t.url === url);
    if (existing >= 0) startMp3(existing);
    else { mp3.tracks.push({ name: src.replace(/\.mp3$/i, ''), url }); startMp3(mp3.tracks.length - 1); }
  };

  window.playSoundEffect = function (src) {
    if (!src) return;
    try { const fx = new Audio(mp3TrackUrl(src)); fx.volume = Math.min(1, mp3.volume + 0.3); fx.play().catch(() => {}); }
    catch { /* ignore */ }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
