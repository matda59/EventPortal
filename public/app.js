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
  const GUESTBOOK_URL = `/api/events/${EVENT_SLUG}/guestbook`;
  const GALLERY_URL = `/api/events/${EVENT_SLUG}/gallery`;
  const RSVP_URL = `/api/events/${EVENT_SLUG}/rsvp`;
  const QUESTIONS_URL = `/api/events/${EVENT_SLUG}/questions`;

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
    galleryName: '',
    galleryItems: null,
    addQuestionName: '',
    rsvpName: '',
    rsvpStatus: 'yes',
    rsvpSummary: null,
    guestbookAvatar: '',
    guestbookAvatarFile: null,
    lightboxIndex: 0,
  };

  const AVATARS = [
    '😊', '😄', '😁', '🥰', '😍', '🤩', '😎', '🤓', '🥳', '😇',
    '🤗', '😺', '🎉', '🎊', '🎂', '🎈', '🎁', '💖', '✨', '🌟',
    '🎶', '💃', '🕺', '🥂', '👍', '🙌', '👏', '🔥', '🌸', '🍀',
    '🐶', '🐱', '🦊', '🐼',
  ];

  // ── Element cache ──────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const screens = {
    home:       $('screen-home'),
    guestbook:  $('screen-guestbook'),
    gallery:    $('screen-gallery'),
    rsvp:       $('screen-rsvp'),
    hof:        $('screen-hof'),
    music:      $('screen-music'),
    welcome:    $('screen-welcome'),
    quiz:       $('screen-quiz'),
    results:    $('screen-results')
  };

  // ── Utilities ──────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => { if (s) s.classList.remove('active'); });
    if (screens[name]) screens[name].classList.add('active');
    const chrome = $('site-chrome');
    if (chrome) chrome.hidden = name === 'home';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function eventLabel() {
    const meta = (state.config && state.config.meta) || {};
    return meta.eventName || meta.title || 'Event';
  }

  function guestFlags() {
    const f = (state.config && state.config.flags) || {};
    return {
      enableQuiz:        f.enableQuiz !== false,
      enableLeaderboard: f.enableLeaderboard !== false,
      enableGallery:     f.enableGallery !== false,
      enableMusic:       f.enableMusic !== false,
      enableGuestbook:   !!f.enableGuestbook,
      enableRsvp:        f.enableRsvp !== false,
      status:            f.status || 'active',
    };
  }

  function showUnavailable({ title, subtitle, message, heroImage, emoji }) {
    document.title = title;
    const mark = emoji != null ? emoji : (((state.config && state.config.meta) || {}).headerEmoji || '');
    if ($('home-emoji')) $('home-emoji').textContent = mark;
    if ($('home-name')) $('home-name').textContent = title;
    if ($('home-kicker')) $('home-kicker').textContent = subtitle || '';
    if ($('home-description')) $('home-description').textContent = message || '';
    if ($('home-when')) $('home-when').hidden = true;
    if ($('home-countdown')) $('home-countdown').hidden = true;
    if ($('home-nav')) {
      $('home-nav').innerHTML = '';
      addMusicTile($('home-nav'));
    }
    renderSidePolaroids();
    const meta = (state.config && state.config.meta) || {};
    applyPageBackground(meta.bgImages && meta.bgImages.length ? meta.bgImages : heroImage);
    const hero = $('home-hero');
    if (hero) {
      hero.hidden = true;
      hero.removeAttribute('src');
    }
    showScreen('home');
  }

  function applyGuestFlags() {
    const f = guestFlags();
    $('name-form').hidden       = !f.enableQuiz;
    $('hall-of-fame').hidden    = !f.enableLeaderboard;
    $('play-again-btn').hidden  = !f.enableQuiz;
  }

  function applyTheme(theme) {
    if (!theme || typeof theme !== 'object') return;
    const root = document.documentElement.style;
    const map = {
      primaryRed: '--primary-red',
      accentOrange: '--accent-orange',
      highlightPink: '--highlight-pink',
      bgEarth: '--bg-earth',
      surfaceCard: '--surface-card',
      textDark: '--text-dark',
    };
    for (const [key, value] of Object.entries(theme)) {
      if (value == null || value === '') continue;
      const prop = map[key] || (String(key).startsWith('--') ? key : null);
      if (prop) root.setProperty(prop, value);
    }
    const color = theme.primaryRed || theme['--primary-red'] || theme.accentOrange || theme['--accent-orange'];
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

  let pageBgTimer = null;

  function applyPageBackground(src) {
    const root = $('page-bg');
    const layers = root ? [root.querySelector('.page-bg-a'), root.querySelector('.page-bg-b')] : [];
    if (pageBgTimer) {
      clearInterval(pageBgTimer);
      pageBgTimer = null;
    }
    const list = [];
    const add = (value) => {
      const url = String(value || '').trim();
      if (url && !list.includes(url)) list.push(url);
    };
    if (Array.isArray(src)) src.forEach(add);
    else add(src);
    document.body.classList.toggle('has-page-bg', list.length > 0);
    if (!root || !layers[0] || !layers[1]) return;
    layers.forEach((el) => el.classList.remove('is-on'));
    if (!list.length) {
      root.hidden = true;
      layers.forEach((el) => { el.style.backgroundImage = ''; });
      return;
    }
    const paint = (el, url) => {
      el.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
    };
    root.hidden = false;
    paint(layers[0], list[0]);
    layers[0].classList.add('is-on');
    if (list.length < 2) return;
    let shown = 0;
    pageBgTimer = setInterval(() => {
      const next = (shown + 1) % list.length;
      const incoming = layers[0].classList.contains('is-on') ? layers[1] : layers[0];
      const outgoing = incoming === layers[0] ? layers[1] : layers[0];
      paint(incoming, list[next]);
      incoming.classList.add('is-on');
      outgoing.classList.remove('is-on');
      shown = next;
    }, 7000);
  }

  function fillChrome(meta) {
    if ($('chrome-emoji')) $('chrome-emoji').textContent = (meta && meta.headerEmoji) || '';
    if ($('chrome-name')) $('chrome-name').textContent = eventLabel();
  }

  function formatEventDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatStartTime(value) {
    const match = String(value || '').match(/^(\d{2}):(\d{2})/);
    if (!match) return '';
    let hour = Number(match[1]);
    const minute = match[2];
    const suffix = hour >= 12 ? 'pm' : 'am';
    hour = hour % 12 || 12;
    return minute === '00' ? `${hour} ${suffix}` : `${hour}:${minute} ${suffix}`;
  }

  function eventMoment(dateStr, timeStr) {
    const parts = String(dateStr || '').split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => !n)) return null;
    const match = String(timeStr || '').match(/^(\d{2}):(\d{2})/);
    const hour = match ? Number(match[1]) : 0;
    const minute = match ? Number(match[2]) : 0;
    return new Date(parts[0], parts[1] - 1, parts[2], hour, minute);
  }

  function countdownLabel(dateStr, timeStr) {
    const when = eventMoment(dateStr, timeStr);
    if (!when) return '';
    const diff = when.getTime() - Date.now();
    if (diff <= 0) return '';
    const days = Math.round(diff / 86400000);
    if (!timeStr && days >= 1) return days === 1 ? 'Tomorrow' : `In ${days} days`;
    if (diff >= 86400000) {
      const whole = Math.floor(diff / 86400000);
      return whole === 1 ? 'Tomorrow' : `In ${whole} days`;
    }
    const hours = Math.floor(diff / 3600000);
    if (hours >= 1) return hours === 1 ? 'In 1 hour' : `In ${hours} hours`;
    return 'Starting soon';
  }

  function galleryItems(ecard) {
    const photos = (ecard && Array.isArray(ecard.photos)) ? ecard.photos : [];
    return photos.filter((p) => p && p.src);
  }

  function isVideoSrc(src) {
    return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(src || '');
  }

  // ── Load config ────────────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch(CONFIG_URL);
      if (res.status === 404) {
        showUnavailable({
          title:   'Event not found',
          message: 'This event link is invalid.',
        });
        setupMp3Player();
        return;
      }
      if (res.status === 403) {
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (data && data.code === 'not_activated') {
          state.config = {
            meta: {
              eventName: data.eventName || 'Event is not activated',
              headerEmoji: data.headerEmoji || '',
              description: 'This event is not activated yet. It will be available here once the host sets the status to active.',
            },
            flags: {
              enableQuiz: false,
              enableLeaderboard: false,
              enableGallery: false,
              enableMusic: data.enableMusic !== false,
              enableGuestbook: false,
              status: 'draft',
            },
          };
          showUnavailable({
            title:   state.config.meta.eventName,
            message: state.config.meta.description,
            emoji:   state.config.meta.headerEmoji,
          });
          await setupMp3Player();
          addMusicTile($('home-nav'));
          wireEvents();
          return;
        }
        throw new Error((data && data.error) || 'Event is not available.');
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
    applyPageBackground(meta.bgImages && meta.bgImages.length ? meta.bgImages : (meta.bgImage || meta.heroImage));
    document.title = meta.eventName || meta.title || (f.status === 'ended' ? 'Event ended' : 'Event');
    fillChrome(meta);
    const musicLabel = $('mp3-label');
    if (musicLabel) musicLabel.textContent = copy.music;

    if (f.status === 'ended') {
      showUnavailable({
        title:     meta.eventName || meta.title || 'This event has ended',
        subtitle:  meta.occasionType || '',
        message:   meta.description || meta.welcomeMessage || 'This event has ended. Thanks for celebrating with us.',
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
      if (hero) {
        hero.src    = meta.heroImage;
        hero.alt    = meta.honoree ? `Photo of ${meta.honoree}` : '';
        hero.hidden = false;
        hero.onerror = () => { hero.hidden = true; };
      }
    }

    state.questions = Array.isArray(state.config.questions) ? state.config.questions : [];
    applyGuestFlags();
    await setupMp3Player();
    wireEvents();
    if (guestFlags().enableGallery) {
      try { await loadGalleryItems(); } catch { state.galleryItems = null; }
    }
    if (guestFlags().enableRsvp) {
      try { state.rsvpSummary = (await apiJson(RSVP_URL)).summary; } catch { state.rsvpSummary = null; }
    }
    renderHome();
    showScreen('home');
  }

  // ── Event home + feature screens ───────────────────────────────────
  function renderHome() {
    const meta  = (state.config && state.config.meta) || {};
    const f     = guestFlags();
    const copy  = occasionCopy(meta);
    const ecard = (state.config && state.config.ecard) || {};
    const items = galleryItems(ecard);

    fillChrome(meta);
    applyPageBackground(meta.bgImages && meta.bgImages.length ? meta.bgImages : (meta.bgImage || meta.heroImage));
    if ($('home-emoji')) $('home-emoji').textContent = meta.headerEmoji || '';
    if ($('home-name')) $('home-name').textContent = eventLabel();
    if ($('home-kicker')) {
      const date = formatEventDate(meta.eventDate);
      $('home-kicker').textContent = [meta.occasionType, date].filter(Boolean).join(' · ');
    }
    if ($('home-description')) {
      $('home-description').textContent =
        meta.description || ecard.message || meta.welcomeMessage || copy.greeting;
    }
    const when = [formatStartTime(meta.startTime), meta.venue].filter(Boolean).join(' · ');
    const whenEl = $('home-when');
    if (whenEl) {
      whenEl.textContent = when;
      whenEl.hidden = !when;
    }
    const countdown = countdownLabel(meta.eventDate, meta.startTime);
    const countEl = $('home-countdown');
    if (countEl) {
      countEl.textContent = countdown;
      countEl.hidden = !countdown;
    }

    const hero = $('home-hero');
    if (hero) {
      hero.hidden = true;
      hero.removeAttribute('src');
    }

    renderSidePolaroids();

    const nav = $('home-nav');
    if (!nav) return;
    nav.innerHTML = '';

    const tiles = [];
    if (f.enableRsvp) {
      const summary = state.rsvpSummary || {};
      const coming = summary.coming || 0;
      const maybe = summary.maybe || 0;
      const hint = coming
        ? `${coming} coming${maybe ? ` · ${maybe} maybe` : ''} · add yours`
        : (maybe ? `${maybe} maybe · add yours` : 'Say if you can make it');
      tiles.push({
        id: 'rsvp',
        emoji: '✉️',
        title: 'RSVP',
        hint,
      });
    }
    if (f.enableQuiz) {
      const count = state.questions.length;
      tiles.push({
        id: 'quiz',
        emoji: '❓',
        title: 'Quiz',
        hint: count
          ? `${count} question${count === 1 ? '' : 's'} · play or add yours`
          : 'Add a question, then play',
      });
    }
    if (f.enableGuestbook) {
      tiles.push({
        id: 'guestbook',
        emoji: '✍️',
        title: 'Guest book',
        hint: 'Leave a note for the hosts',
      });
    }
    if (f.enableGallery) {
      const count = Array.isArray(state.galleryItems) ? state.galleryItems.length : items.length;
      tiles.push({
        id: 'gallery',
        emoji: '📷',
        title: 'Gallery',
        hint: count
          ? `${count} photo${count === 1 ? '' : 's'} & clips · add yours`
          : 'Add a photo or video',
      });
    }
    if (f.enableLeaderboard) {
      tiles.push({
        id: 'hof',
        emoji: '🏆',
        title: 'Hall of Fame',
        hint: 'See the quiz leaderboard',
      });
    }
    if (f.enableMusic && f.status !== 'ended') {
      const count = mp3.tracks.length;
      tiles.push({
        id: 'music',
        emoji: '🎵',
        title: 'Music',
        hint: count ? `${count} song${count === 1 ? '' : 's'}` : 'Play the playlist',
      });
    }

    if (!tiles.length) {
      nav.innerHTML = '<p class="hof-empty">This event has no guest features turned on yet.</p>';
      return;
    }

    tiles.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'home-tile';
      btn.innerHTML =
        `<span class="home-tile-emoji">${t.emoji}</span>` +
        `<span class="home-tile-title">${escHtml(t.title)}</span>` +
        `<span class="home-tile-hint">${escHtml(t.hint)}</span>`;
      btn.addEventListener('click', () => {
        if (t.id === 'quiz') openQuiz();
        else if (t.id === 'rsvp') openRsvp();
        else if (t.id === 'guestbook') openGuestbook();
        else if (t.id === 'gallery') openGallery();
        else if (t.id === 'hof') openHof();
        else if (t.id === 'music') openMusic();
      });
      nav.appendChild(btn);
    });
  }

  function polaroidScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 100;
    return Math.min(200, Math.max(60, Math.round(n)));
  }

  function renderSidePolaroids() {
    const host = $('home-polaroids');
    const screen = $('screen-home');
    if (!host || !screen) return;
    const photos = ((state.config && state.config.ecard) || {}).photos;
    const list = Array.isArray(photos) ? photos.filter((p) => p && p.src).slice(0, 8) : [];
    const html = list.map((p, i) => {
      const video = isVideoSrc(p.src);
      const src = escHtml(p.src);
      const cap = escHtml(p.caption || '');
      const media = video
        ? `<video src="${src}" muted playsinline></video>`
        : `<img src="${src}" alt="${cap}" />`;
      return `<button type="button" class="home-polaroid home-pos-${i + 1}" style="--polaroid-scale:${polaroidScale(p.size)}" data-enlarge data-index="${i}" data-src="${src}" data-caption="${cap}" data-video="${video ? '1' : '0'}">${media}${cap ? `<span>${cap}</span>` : ''}</button>`;
    }).join('');
    host.innerHTML = html;
    screen.classList.toggle('has-polaroids', !!html);
  }

  function polaroidViewerItems() {
    const photos = ((state.config && state.config.ecard) || {}).photos;
    return (Array.isArray(photos) ? photos : [])
      .filter((p) => p && p.src)
      .slice(0, 8)
      .map((p) => ({ src: p.src, caption: p.caption || '', name: '' }));
  }

  function onEnlargeClick(e) {
    const btn = e.target.closest('[data-enlarge]');
    if (!btn) return;
    const items = polaroidViewerItems();
    const index = Number(btn.getAttribute('data-index'));
    showLightboxItem(Number.isFinite(index) ? index : 0, items);
  }

  function goHome() {
    const f = guestFlags();
    if (f.status === 'draft') {
      const meta = (state.config && state.config.meta) || {};
      showUnavailable({
        title: meta.eventName || 'Event is not activated',
        message: meta.description || 'This event is not activated yet. It will be available here once the host sets the status to active.',
        emoji: meta.headerEmoji || '',
      });
      addMusicTile($('home-nav'));
      return;
    }
    renderHome();
    showScreen('home');
  }

  function openMusic() {
    renderMusicList();
    showScreen('music');
  }

  function addMusicTile(nav) {
    const f = guestFlags();
    if (!nav || !state.config || !f.enableMusic || f.status === 'ended') return;
    if (nav.querySelector('[data-feature="music"]')) return;
    const count = mp3.tracks.length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'home-tile';
    btn.setAttribute('data-feature', 'music');
    btn.innerHTML =
      '<span class="home-tile-emoji">🎵</span>' +
      '<span class="home-tile-title">Music</span>' +
      `<span class="home-tile-hint">${count ? `${count} song${count === 1 ? '' : 's'}` : 'Play the playlist'}</span>`;
    btn.addEventListener('click', openMusic);
    nav.appendChild(btn);
  }

  function rememberedName() {
    return state.addQuestionName || state.guestbookName || state.galleryName || state.playerName || '';
  }

  function renderQuestionBank() {
    const bank = $('question-bank');
    const note = $('quiz-empty-note');
    const list = state.questions || [];
    if (note) note.hidden = list.length > 0;
    if (!bank) return;
    if (!list.length) {
      bank.innerHTML = '<p class="hof-empty">No questions yet. Add the first one.</p>';
      return;
    }
    bank.innerHTML = list.map((q) => {
      const by = q.submittedBy ? `<strong>${escHtml(q.submittedBy)}</strong> ` : '';
      const photo = q.image && !isVideoSrc(q.image)
        ? `<img class="question-bank-photo" src="${escHtml(q.image)}" alt="" />`
        : '';
      return `<article class="question-bank-item">${photo}<span>${by}${escHtml(q.question || '')}</span></article>`;
    }).join('');
  }

  function setQuizAddOpen(open) {
    const panel = $('quiz-add');
    const toggle = $('quiz-add-toggle');
    if (panel) panel.hidden = !open;
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Add a question';
    }
    if (!open) return;
    const name = rememberedName();
    if (name && $('add-question-name') && !$('add-question-name').value) {
      $('add-question-name').value = name;
    }
  }

  function clearQuestionPhoto() {
    const input = $('add-question-photo');
    const preview = $('add-question-preview');
    if (input) input.value = '';
    if (preview) {
      if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.removeAttribute('src');
      preview.hidden = true;
    }
  }

  async function refreshQuestions() {
    const data = await apiJson(QUESTIONS_URL);
    if (!Array.isArray(data.questions)) return state.questions;
    state.questions = data.questions;
    if (state.config) state.config.questions = data.questions;
    return state.questions;
  }

  async function openQuiz() {
    const name = rememberedName();
    if (name && $('player-name') && !$('player-name').value) $('player-name').value = name;
    if (name && $('add-question-name') && !$('add-question-name').value) $('add-question-name').value = name;
    const errEl = $('question-form-error');
    const okEl = $('question-form-ok');
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;
    setQuizAddOpen(false);
    showScreen('welcome');
    renderQuestionBank();
    if (guestFlags().enableQuiz) {
      try {
        await refreshQuestions();
        renderQuestionBank();
      } catch { /* keep the questions loaded with the event */ }
      setTimeout(() => $('player-name')?.focus(), 300);
    }
  }

  function isQuestionPhoto(file) {
    if (!file) return false;
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.type || '')) return true;
    return /\.(jpe?g|png|gif|webp)$/i.test(file.name || '');
  }

  function collectNewQuestion() {
    const marked = Number(document.querySelector('input[name="add-question-correct"]:checked')?.value ?? 0);
    const options = [];
    let correctIndex = -1;
    for (let i = 0; i < 4; i++) {
      const value = $(`add-question-opt-${i}`)?.value.trim() || '';
      if (!value) continue;
      if (i === marked) correctIndex = options.length;
      options.push(value);
    }
    return { options, correctIndex };
  }

  async function onQuestionSubmit(e) {
    e.preventDefault();
    const errEl = $('question-form-error');
    const okEl = $('question-form-ok');
    const btn = $('question-submit');
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;
    const name = $('add-question-name').value.trim();
    const question = $('add-question-text').value.trim();
    const funFact = $('add-question-fact').value.trim();
    const photo = $('add-question-photo')?.files && $('add-question-photo').files[0];
    const { options, correctIndex } = collectNewQuestion();
    if (!name) {
      errEl.textContent = 'Please enter your name.';
      errEl.hidden = false;
      $('add-question-name').focus();
      return;
    }
    if (!question) {
      errEl.textContent = 'Write a question.';
      errEl.hidden = false;
      $('add-question-text').focus();
      return;
    }
    if (options.length < 2) {
      errEl.textContent = 'Add at least two answers.';
      errEl.hidden = false;
      $('add-question-opt-0').focus();
      return;
    }
    if (correctIndex < 0) {
      errEl.textContent = 'Mark the correct answer, and make sure that answer has text.';
      errEl.hidden = false;
      return;
    }
    if (photo && photo.size > 8 * 1024 * 1024) {
      errEl.textContent = 'Photo must be under 8 MB.';
      errEl.hidden = false;
      return;
    }
    if (photo && !isQuestionPhoto(photo)) {
      errEl.textContent = 'Photo must be a jpg, png, gif, or webp.';
      errEl.hidden = false;
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Adding…';
    }
    try {
      let data;
      if (photo) {
        const body = new FormData();
        body.append('name', name);
        body.append('question', question);
        body.append('funFact', funFact);
        body.append('options', JSON.stringify(options));
        body.append('correctIndex', String(correctIndex));
        body.append('file', photo);
        data = await apiJson(QUESTIONS_URL, { method: 'POST', body });
      } else {
        data = await apiJson(QUESTIONS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, question, options, correctIndex, funFact }),
        });
      }
      state.addQuestionName = name;
      if (!$('player-name').value) $('player-name').value = name;
      if (Array.isArray(data.questions)) {
        state.questions = data.questions;
        if (state.config) state.config.questions = data.questions;
      }
      $('add-question-text').value = '';
      $('add-question-fact').value = '';
      clearQuestionPhoto();
      for (let i = 0; i < 4; i++) $(`add-question-opt-${i}`).value = '';
      const first = document.querySelector('input[name="add-question-correct"][value="0"]');
      if (first) first.checked = true;
      if (okEl) okEl.hidden = false;
      renderQuestionBank();
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Unable to save question.';
        errEl.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Add question';
      }
    }
  }

  function galleryCaption(item) {
    const name = item.name ? escHtml(item.name) : '';
    const cap = item.caption ? escHtml(item.caption) : '';
    if (name && cap) return `<figcaption><strong>${name}</strong> ${cap}</figcaption>`;
    if (name) return `<figcaption><strong>${name}</strong></figcaption>`;
    if (cap) return `<figcaption>${cap}</figcaption>`;
    return '';
  }

  function renderGalleryGrid(items) {
    const grid = $('gallery-grid');
    if (!grid) return;
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      grid.innerHTML = '<p class="hof-empty">No photos or videos yet. Add the first one.</p>';
      return;
    }
    grid.innerHTML = list.map((p, i) => {
      const src = escHtml(p.src);
      const label = escHtml(p.caption || p.name || 'View larger');
      const media = isVideoSrc(p.src)
        ? `<video src="${src}" muted playsinline></video>`
        : `<img src="${src}" alt="" />`;
      return `<figure class="gallery-item">
        <button type="button" class="gallery-open" data-gallery-open="${i}" aria-label="${label}">${media}</button>
        ${galleryCaption(p)}
      </figure>`;
    }).join('');
  }

  async function loadGalleryItems() {
    if (!guestFlags().enableGallery) {
      state.galleryItems = [];
      return [];
    }
    const data = await apiJson(GALLERY_URL);
    state.galleryItems = Array.isArray(data.items) ? data.items : [];
    return state.galleryItems;
  }

  async function openGallery() {
    const errEl = $('gallery-error');
    if (errEl) errEl.hidden = true;
    if (state.galleryName && $('gallery-name')) $('gallery-name').value = state.galleryName;
    showScreen('gallery');
    const grid = $('gallery-grid');
    if (grid && !state.galleryItems) grid.innerHTML = '<p class="hof-empty">Loading…</p>';
    else renderGalleryGrid(state.galleryItems || []);
    try {
      renderGalleryGrid(await loadGalleryItems());
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Unable to read gallery.';
        errEl.hidden = false;
      }
    }
  }

  async function onGallerySubmit(e) {
    e.preventDefault();
    const errEl = $('gallery-error');
    const btn = $('gallery-submit');
    const name = $('gallery-name').value.trim();
    const caption = $('gallery-caption').value.trim();
    const file = $('gallery-file').files && $('gallery-file').files[0];
    if (!name) {
      errEl.textContent = 'Please enter your name.';
      errEl.hidden = false;
      $('gallery-name').focus();
      return;
    }
    if (!file) {
      errEl.textContent = 'Choose a photo or video.';
      errEl.hidden = false;
      return;
    }
    const body = new FormData();
    body.append('name', name);
    body.append('caption', caption);
    body.append('file', file);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Uploading…';
    }
    try {
      const data = await apiJson(GALLERY_URL, { method: 'POST', body });
      state.galleryName = name;
      state.galleryItems = Array.isArray(data.items) ? data.items : [];
      $('gallery-caption').value = '';
      $('gallery-file').value = '';
      if (errEl) errEl.hidden = true;
      renderGalleryGrid(state.galleryItems);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Unable to save gallery upload.';
        errEl.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Add to gallery';
      }
    }
  }

  const lightbox = {
    scale: 1,
    x: 0,
    y: 0,
    pointers: new Map(),
    drag: null,
    pinchDist: 0,
    pinchScale: 1,
  };

  function lightboxMedia() {
    const video = $('lightbox-video');
    const img = $('lightbox-img');
    if (video && !video.hidden) return video;
    return img;
  }

  function applyLightboxTransform() {
    const media = lightboxMedia();
    if (!media) return;
    media.style.transform = `translate(${lightbox.x}px, ${lightbox.y}px) scale(${lightbox.scale})`;
  }

  function resetLightboxZoom() {
    lightbox.scale = 1;
    lightbox.x = 0;
    lightbox.y = 0;
    applyLightboxTransform();
  }

  function setLightboxZoom(next) {
    lightbox.scale = Math.min(5, Math.max(1, next));
    if (lightbox.scale <= 1) {
      lightbox.scale = 1;
      lightbox.x = 0;
      lightbox.y = 0;
    }
    applyLightboxTransform();
  }

  function showLightboxItem(index, items) {
    if (Array.isArray(items)) state.viewerItems = items;
    const list = (state.viewerItems && state.viewerItems.length)
      ? state.viewerItems
      : (state.galleryItems || []);
    if (!list.length) return;
    items = list;
    const next = (index + list.length) % list.length;
    state.lightboxIndex = next;
    const item = list[next];
    const img = $('lightbox-img');
    const video = $('lightbox-video');
    const caption = $('lightbox-caption');
    const bits = [item.name, item.caption].filter(Boolean);
    if (caption) caption.textContent = bits.join(' · ');
    resetLightboxZoom();
    if (isVideoSrc(item.src)) {
      if (img) { img.hidden = true; img.removeAttribute('src'); }
      if (video) {
        video.hidden = false;
        video.src = item.src;
        video.play().catch(() => {});
      }
    } else {
      if (video) {
        video.pause();
        video.hidden = true;
        video.removeAttribute('src');
      }
      if (img) {
        img.hidden = false;
        img.src = item.src;
        img.alt = item.caption || item.name || 'Photo';
      }
    }
    const box = $('lightbox');
    if (box) box.hidden = false;
    document.body.classList.add('lightbox-open');
  }

  function closeLightbox() {
    const box = $('lightbox');
    if (box) box.hidden = true;
    document.body.classList.remove('lightbox-open');
    const video = $('lightbox-video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
    }
    const img = $('lightbox-img');
    if (img) img.removeAttribute('src');
    resetLightboxZoom();
  }

  function onGalleryOpen(e) {
    const btn = e.target.closest('[data-gallery-open]');
    if (!btn) return;
    showLightboxItem(Number(btn.getAttribute('data-gallery-open')) || 0, state.galleryItems || []);
  }

  function pinchDistance() {
    const pts = [...lightbox.pointers.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  function wireLightbox() {
    const stage = $('lightbox-stage');
    $('lightbox-close')?.addEventListener('click', closeLightbox);
    $('lightbox-in')?.addEventListener('click', () => setLightboxZoom(lightbox.scale * 1.25));
    $('lightbox-out')?.addEventListener('click', () => setLightboxZoom(lightbox.scale / 1.25));
    $('lightbox-fit')?.addEventListener('click', resetLightboxZoom);
    $('lightbox-prev')?.addEventListener('click', () => showLightboxItem(state.lightboxIndex - 1));
    $('lightbox-next')?.addEventListener('click', () => showLightboxItem(state.lightboxIndex + 1));
    stage?.addEventListener('dblclick', () => {
      if (lightbox.scale > 1) resetLightboxZoom();
      else setLightboxZoom(2);
    });
    stage?.addEventListener('wheel', (e) => {
      if ($('lightbox')?.hidden) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setLightboxZoom(lightbox.scale * factor);
    }, { passive: false });
    stage?.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      lightbox.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stage.setPointerCapture(e.pointerId);
      if (lightbox.pointers.size === 1) {
        lightbox.drag = { x: e.clientX, y: e.clientY, ox: lightbox.x, oy: lightbox.y, moved: false };
      } else if (lightbox.pointers.size >= 2) {
        lightbox.pinchDist = pinchDistance();
        lightbox.pinchScale = lightbox.scale;
        lightbox.drag = null;
      }
    });
    stage?.addEventListener('pointermove', (e) => {
      if (!lightbox.pointers.has(e.pointerId)) return;
      lightbox.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (lightbox.pointers.size >= 2 && lightbox.pinchDist) {
        setLightboxZoom(lightbox.pinchScale * (pinchDistance() / lightbox.pinchDist));
        return;
      }
      if (!lightbox.drag || lightbox.scale <= 1) return;
      const dx = e.clientX - lightbox.drag.x;
      const dy = e.clientY - lightbox.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) lightbox.drag.moved = true;
      lightbox.x = lightbox.drag.ox + dx;
      lightbox.y = lightbox.drag.oy + dy;
      stage.classList.add('is-dragging');
      applyLightboxTransform();
    });
    const endPointer = (e) => {
      lightbox.pointers.delete(e.pointerId);
      if (lightbox.pointers.size < 2) lightbox.pinchDist = 0;
      if (lightbox.pointers.size === 0) {
        stage.classList.remove('is-dragging');
        const dragged = lightbox.drag && lightbox.drag.moved;
        lightbox.drag = null;
        if (!dragged && e.target === stage) closeLightbox();
      }
    };
    stage?.addEventListener('pointerup', endPointer);
    stage?.addEventListener('pointercancel', endPointer);
    document.addEventListener('keydown', (e) => {
      if ($('lightbox')?.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showLightboxItem(state.lightboxIndex - 1);
      else if (e.key === 'ArrowRight') showLightboxItem(state.lightboxIndex + 1);
      else if (e.key === '+' || e.key === '=') setLightboxZoom(lightbox.scale * 1.25);
      else if (e.key === '-' || e.key === '_') setLightboxZoom(lightbox.scale / 1.25);
      else if (e.key === '0') resetLightboxZoom();
    });
  }

  async function openHof() {
    const container = $('hof-home-rows');
    if (container) container.innerHTML = '<div class="hof-loading">Loading…</div>';
    showScreen('hof');
    try {
      const rows = await apiJson(SCORES_URL);
      renderHallOfFame(rows, 'hof-home-rows');
    } catch {
      renderHallOfFame([], 'hof-home-rows');
    }
  }

  // ── Welcome / name entry ───────────────────────────────────────────
  function wireEvents() {
    $('home-polaroids')?.addEventListener('click', onEnlargeClick);
    $('nav-home')?.addEventListener('click', () => {
      if ($('screen-results')?.classList.contains('active')) closeResults();
      else goHome();
    });
    $('results-home')?.addEventListener('click', closeResults);
    $('results-close')?.addEventListener('click', closeResults);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('lightbox')?.hidden) return;
      if ($('screen-results')?.classList.contains('active')) closeResults();
    });
    window.addEventListener('popstate', () => {
      const fromResults = pushedResults;
      pushedResults = false;
      if (fromResults && $('screen-results')?.classList.contains('active')) goHome();
    });
    $('guestbook-form')?.addEventListener('submit', onGuestbookSubmit);
    $('rsvp-form')?.addEventListener('submit', onRsvpSubmit);
    document.querySelectorAll('[data-rsvp-status]').forEach((btn) => {
      btn.addEventListener('click', () => setRsvpStatus(btn.getAttribute('data-rsvp-status')));
    });
    $('gallery-form')?.addEventListener('submit', onGallerySubmit);
    $('question-form')?.addEventListener('submit', onQuestionSubmit);
    $('quiz-add-toggle')?.addEventListener('click', () => {
      const open = $('quiz-add')?.hidden !== false;
      setQuizAddOpen(open);
      if (open) $('add-question-text')?.focus();
    });
    $('add-question-photo')?.addEventListener('change', () => {
      const file = $('add-question-photo').files && $('add-question-photo').files[0];
      const preview = $('add-question-preview');
      const errEl = $('question-form-error');
      if (!file) {
        clearQuestionPhoto();
        return;
      }
      if (file.size > 8 * 1024 * 1024 || !isQuestionPhoto(file)) {
        if (errEl) {
          errEl.textContent = file.size > 8 * 1024 * 1024
            ? 'Photo must be under 8 MB.'
            : 'Photo must be a jpg, png, gif, or webp.';
          errEl.hidden = false;
        }
        clearQuestionPhoto();
        return;
      }
      if (errEl) errEl.hidden = true;
      if (preview) {
        if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
      }
    });
    $('gallery-grid')?.addEventListener('click', onGalleryOpen);
    renderAvatarChoices();
    wireAvatarPicker();
    wireLightbox();

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

  function avatarMarkup(avatar) {
    const value = String(avatar || '');
    if (!value) return '';
    if (value.startsWith('/images/')) {
      return `<img class="gb-avatar" src="${escHtml(value)}" alt="" />`;
    }
    return `<span class="gb-avatar" aria-hidden="true">${escHtml(value)}</span>`;
  }

  function renderAvatarChoices() {
    const box = $('avatar-choices');
    if (!box || box.childElementCount) return;
    box.innerHTML = AVATARS.map((emoji, i) => `
      <button type="button" class="avatar-choice" role="option" data-avatar-index="${i}" aria-selected="false" aria-label="Avatar ${i + 1}">${emoji}</button>
    `).join('');
  }

  function syncAvatarChoice() {
    const fileChosen = !!state.guestbookAvatarFile;
    document.querySelectorAll('.avatar-choice').forEach((btn) => {
      const emoji = AVATARS[Number(btn.getAttribute('data-avatar-index'))];
      const on = !fileChosen && emoji === state.guestbookAvatar;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const preview = $('avatar-preview');
    const clearBtn = $('avatar-clear');
    if (preview) preview.hidden = !fileChosen;
    if (clearBtn) clearBtn.hidden = !fileChosen;
  }

  function wireAvatarPicker() {
    $('avatar-choices')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-avatar-index]');
      if (!btn) return;
      state.guestbookAvatar = AVATARS[Number(btn.getAttribute('data-avatar-index'))] || '';
      clearAvatarFile();
      syncAvatarChoice();
    });
    $('guestbook-avatar-file')?.addEventListener('change', () => {
      const file = $('guestbook-avatar-file').files && $('guestbook-avatar-file').files[0];
      if (!file) {
        clearAvatarFile();
        syncAvatarChoice();
        return;
      }
      if (file.size > 400 * 1024) {
        const errEl = $('guestbook-error');
        if (errEl) {
          errEl.textContent = 'Emoticon must be under 400 KB.';
          errEl.hidden = false;
        }
        $('guestbook-avatar-file').value = '';
        return;
      }
      state.guestbookAvatarFile = file;
      const preview = $('avatar-preview');
      if (preview) {
        if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
      }
      syncAvatarChoice();
    });
    $('avatar-clear')?.addEventListener('click', () => {
      clearAvatarFile();
      syncAvatarChoice();
    });
  }

  function clearAvatarFile() {
    state.guestbookAvatarFile = null;
    const input = $('guestbook-avatar-file');
    if (input) input.value = '';
    const preview = $('avatar-preview');
    if (preview) {
      if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
      preview.removeAttribute('src');
      preview.hidden = true;
    }
  }

  function renderGuestbookList(entries) {
    const list = $('guestbook-list');
    if (!list) return;
    if (!entries || !entries.length) {
      list.innerHTML = '<p class="hof-empty">Be the first to sign.</p>';
      return;
    }
    list.innerHTML = entries.map((e) => `
      <article class="guestbook-entry">
        <div class="guestbook-entry-head">${avatarMarkup(e.avatar)}<strong>${escHtml(e.name)}</strong></div>
        <p>${escHtml(e.message)}</p>
      </article>`).join('');
  }

  function setRsvpStatus(status) {
    state.rsvpStatus = status === 'no' || status === 'maybe' ? status : 'yes';
    document.querySelectorAll('[data-rsvp-status]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-rsvp-status') === state.rsvpStatus ? 'true' : 'false');
    });
    const wrap = $('rsvp-count-wrap');
    if (wrap) wrap.hidden = state.rsvpStatus === 'no';
  }

  function renderRsvpList(data) {
    const list = $('rsvp-list');
    const summary = (data && data.summary) || { coming: 0, maybe: 0 };
    const entries = (data && data.entries) || [];
    state.rsvpSummary = summary;
    if (!list) return;
    if (!entries.length) {
      list.innerHTML = '<p class="hof-empty">No replies yet. Be the first.</p>';
      return;
    }
    const bits = [];
    if (summary.coming) bits.push(`${summary.coming} coming`);
    if (summary.maybe) bits.push(`${summary.maybe} maybe`);
    const head = bits.length ? `<p class="hof-empty">${bits.join(' · ')}</p>` : '';
    const rows = entries.map((entry) => {
      const count = entry.status === 'yes' || entry.status === 'maybe'
        ? ` · ${entry.partySize}`
        : '';
      const word = entry.status === 'maybe' ? 'Maybe' : 'Coming';
      return `<article class="question-bank-item"><span><strong>${escHtml(entry.name)}</strong> ${escHtml(word)}${count}</span></article>`;
    }).join('');
    list.innerHTML = head + rows;
  }

  async function openRsvp() {
    const name = state.rsvpName || rememberedName();
    if (name && $('rsvp-name') && !$('rsvp-name').value) $('rsvp-name').value = name;
    const errEl = $('rsvp-error');
    const okEl = $('rsvp-ok');
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;
    setRsvpStatus(state.rsvpStatus || 'yes');
    showScreen('rsvp');
    try {
      renderRsvpList(await apiJson(RSVP_URL));
    } catch (err) {
      renderRsvpList({ summary: { coming: 0, maybe: 0 }, entries: [] });
      if (errEl) {
        errEl.textContent = err.message || 'Could not load RSVPs.';
        errEl.hidden = false;
      }
    }
  }

  async function onRsvpSubmit(e) {
    e.preventDefault();
    const errEl = $('rsvp-error');
    const okEl = $('rsvp-ok');
    const btn = $('rsvp-submit');
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;
    const name = $('rsvp-name').value.trim();
    const note = $('rsvp-note').value.trim();
    const status = state.rsvpStatus || 'yes';
    const partySize = status === 'no' ? 0 : Number($('rsvp-count').value);
    if (!name) {
      errEl.textContent = 'Please enter your name.';
      errEl.hidden = false;
      $('rsvp-name').focus();
      return;
    }
    if (status !== 'no' && (!Number.isInteger(partySize) || partySize < 1 || partySize > 10)) {
      errEl.textContent = 'Say how many people are coming, from 1 to 10.';
      errEl.hidden = false;
      $('rsvp-count').focus();
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Sending…';
    }
    try {
      const data = await apiJson(RSVP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, status, partySize, note }),
      });
      state.rsvpName = name;
      $('rsvp-note').value = '';
      if (okEl) {
        okEl.textContent = data.updated
          ? 'Updated. The hosts have your new reply.'
          : 'Saved. The hosts have your reply.';
        okEl.hidden = false;
      }
      renderRsvpList(data);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Unable to save RSVP.';
        errEl.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send RSVP';
      }
    }
  }

  async function openGuestbook() {
    const meta = (state.config && state.config.meta) || {};
    const honoree = meta.honoree || '';
    $('guestbook-title').textContent = 'Guest book';
    $('guestbook-lead').textContent = honoree
      ? `Leave a short note for ${honoree}.`
      : 'Leave a short note for the hosts.';
    if (state.guestbookName) $('guestbook-name').value = state.guestbookName;
    showScreen('guestbook');
    const errEl = $('guestbook-error');
    if (errEl) errEl.hidden = true;
    try {
      const data = await apiJson(GUESTBOOK_URL);
      renderGuestbookList(data.entries);
    } catch (err) {
      renderGuestbookList([]);
      const errEl = $('guestbook-error');
      if (errEl) {
        errEl.textContent = err.message || 'Could not load the guest book.';
        errEl.hidden = false;
      }
    }
  }

  async function onGuestbookSubmit(e) {
    e.preventDefault();
    const errEl = $('guestbook-error');
    errEl.hidden = true;
    const name = $('guestbook-name').value.trim();
    const message = $('guestbook-message').value.trim();
    if (!name) {
      errEl.textContent = 'Please enter your name.';
      errEl.hidden = false;
      $('guestbook-name').focus();
      return;
    }
    if (!message) {
      errEl.textContent = 'Please write a short message.';
      errEl.hidden = false;
      $('guestbook-message').focus();
      return;
    }
    const file = state.guestbookAvatarFile;
    if (file && file.size > 400 * 1024) {
      errEl.textContent = 'Emoticon must be under 400 KB.';
      errEl.hidden = false;
      return;
    }
    try {
      let data;
      if (file) {
        const body = new FormData();
        body.append('name', name);
        body.append('message', message);
        body.append('file', file);
        data = await apiJson(GUESTBOOK_URL, { method: 'POST', body });
      } else {
        data = await apiJson(GUESTBOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, message, avatar: state.guestbookAvatar }),
        });
      }
      state.guestbookName = name;
      $('guestbook-message').value = '';
      renderGuestbookList(data.entries);
    } catch (err) {
      errEl.textContent = err.message || 'Could not save your message.';
      errEl.hidden = false;
    }
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
      if (Array.isArray(started.questions) && started.questions.length) {
        state.questions = started.questions;
        if (state.config) state.config.questions = started.questions;
      }
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

  function clearFunFacts() {
    $('question-anim')?.querySelectorAll('.fun-fact').forEach((el) => el.remove());
  }

  function showFunFact(text) {
    clearFunFacts();
    if (!text) return;
    const fact = document.createElement('div');
    fact.className = 'fun-fact';
    const body = document.createElement('p');
    body.textContent = `💡 ${text}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fun-fact-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => fact.remove());
    fact.append(body, close);
    $('question-anim').appendChild(fact);
  }

  function renderQuestion() {
    const q     = state.questions[state.current];
    const total = state.questions.length;
    state.selectedIndex = null;
    state.answered      = false;
    state.grading       = false;
    showQuizError('');
    clearFunFacts();
    window.scrollTo({ top: 0, behavior: 'smooth' });

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

      showFunFact(q.funFact);
      $('next-btn').disabled = false;
      $('next-btn').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

    if (!$('lightbox')?.hidden) closeLightbox();
    showScreen('results');
    rememberResults();
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

  function renderHallOfFame(scores, containerId) {
    const container = $(containerId || 'hof-rows');
    if (!container) return;
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

  let pushedResults = false;

  function rememberResults() {
    if (pushedResults) return;
    try {
      history.pushState({ eventPortal: 'results' }, '');
      pushedResults = true;
    } catch { /* history can be unavailable */ }
  }

  function dropResultsHistory() {
    if (!pushedResults) return;
    pushedResults = false;
    history.back();
  }

  function closeResults() {
    goHome();
    dropResultsHistory();
  }

  function resetAndRestart() {
    $('player-name').value = '';
    state.playerName = '';
    state.sessionId  = null;
    state.current    = 0;
    state.score      = 0;
    clearFunFacts();
    showScreen('welcome');
    dropResultsHistory();
  }

  // ── MP3 Player ─────────────────────────────────────────────────────
  const mp3 = { tracks: [], index: 0, playing: false, volume: 0.3, audio: null, open: true, bound: false, error: '' };

  function musicWanted() {
    const f = state.config && state.config.flags;
    if (!f || f.status === 'ended') return false;
    return f.enableMusic !== false;
  }

  function mp3TrackUrl(name) {
    const value = String(name || '');
    if (/^(https?:)?\//.test(value)) return value;
    return '/music/' + encodeURIComponent(value);
  }

  function mp3Label(src) {
    let base = String(src || '').split('/').pop() || 'Track';
    try { base = decodeURIComponent(base); } catch { /* keep */ }
    return base.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ') || 'Track';
  }

  function bindMp3Controls() {
    if (mp3.bound) return;
    mp3.bound = true;
    const audio = $('mp3-audio');
    mp3.audio = audio;
    if (audio) {
      audio.onended = () => startMp3(mp3.index + 1);
      audio.onerror = () => {
        mp3.playing = false;
        mp3.error = 'This song could not be played.';
        updateMp3Label();
      };
    }
    $('mp3-toggle')?.addEventListener('click', () => {
      mp3.open = !mp3.open;
      $('mp3-panel').style.display = mp3.open ? 'block' : 'none';
      $('mp3-chevron').textContent = mp3.open ? '▲' : '▼';
    });
    $('mp3-play')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMp3(); });
    $('mp3-next')?.addEventListener('click', (e) => { e.stopPropagation(); startMp3(mp3.index + 1); });
    $('mp3-prev')?.addEventListener('click', (e) => { e.stopPropagation(); startMp3(mp3.index - 1); });
    $('music-play')?.addEventListener('click', toggleMp3);
    $('music-next')?.addEventListener('click', () => startMp3(mp3.index + 1));
    $('music-prev')?.addEventListener('click', () => startMp3(mp3.index - 1));
    $('music-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-track]');
      if (!btn) return;
      startMp3(Number(btn.getAttribute('data-track')));
    });
    const onVolume = (e) => setMp3Volume(parseFloat(e.target.value));
    $('mp3-volume')?.addEventListener('input', onVolume);
    $('music-volume')?.addEventListener('input', onVolume);
  }

  function setMp3Volume(value) {
    if (!Number.isFinite(value)) return;
    mp3.volume = value;
    if (mp3.audio) mp3.audio.volume = value;
    ['mp3-volume', 'music-volume'].forEach((id) => {
      const el = $(id);
      if (el) el.value = String(value);
    });
  }

  async function setupMp3Player() {
    bindMp3Controls();
    const player = $('mp3-player');
    if (!musicWanted()) {
      mp3.tracks = [];
      if (player) player.hidden = true;
      return;
    }
    try {
      const res = await fetch(MUSIC_URL);
      const files = res.ok ? await res.json() : [];
      mp3.tracks = (Array.isArray(files) ? files : []).map((f) => ({
        name: mp3Label(f),
        url: mp3TrackUrl(f),
      }));
    } catch { mp3.tracks = []; }

    if (player) player.hidden = false;
    mp3.error = '';
    updateMp3Label();
    const existing = document.querySelector('[data-feature="music"] .home-tile-hint');
    if (existing) {
      const count = mp3.tracks.length;
      existing.textContent = count ? `${count} song${count === 1 ? '' : 's'}` : 'Play the playlist';
    }
  }

  function startMp3(idx) {
    if (!mp3.tracks.length) {
      mp3.error = 'No songs yet. Add MP3s in the event’s Media tab.';
      updateMp3Label();
      return;
    }
    const audio = mp3.audio || $('mp3-audio');
    if (!audio) return;
    mp3.audio = audio;
    const n = mp3.tracks.length;
    mp3.index = ((idx % n) + n) % n;
    mp3.error = '';
    audio.pause();
    audio.volume = mp3.volume;
    const nextUrl = mp3.tracks[mp3.index].url;
    if (audio.getAttribute('src') !== nextUrl) audio.src = nextUrl;
    mp3.playing = true;
    updateMp3Label();
    const pending = audio.play();
    if (pending && pending.catch) {
      pending.catch(() => {
        mp3.playing = false;
        mp3.error = 'This song could not be played.';
        updateMp3Label();
      });
    }
  }

  function toggleMp3() {
    if (!mp3.tracks.length) {
      mp3.error = 'No songs yet. Add MP3s in the event’s Media tab.';
      updateMp3Label();
      return;
    }
    const audio = mp3.audio || $('mp3-audio');
    if (mp3.playing) {
      mp3.playing = false;
      if (audio) audio.pause();
      updateMp3Label();
      return;
    }
    if (audio && audio.src && audio.paused && audio.getAttribute('src')) {
      mp3.playing = true;
      mp3.error = '';
      updateMp3Label();
      audio.play().catch(() => {
        mp3.playing = false;
        mp3.error = 'This song could not be played.';
        updateMp3Label();
      });
      return;
    }
    startMp3(mp3.index);
  }

  function renderMusicList() {
    const list = $('music-list');
    const lead = $('music-lead');
    if (lead) {
      lead.textContent = mp3.tracks.length ? 'Tap a song to play it.' : 'No songs have been added yet.';
    }
    if (!list) return;
    if (!mp3.tracks.length) {
      list.innerHTML = '<li class="music-empty">No songs yet. Add MP3s in the event’s Media tab.</li>';
      return;
    }
    list.innerHTML = mp3.tracks.map((track, i) => `
      <li>
        <button type="button" class="music-track${i === mp3.index && mp3.playing ? ' is-playing' : ''}" data-track="${i}">
          ${escHtml(track.name)}
        </button>
      </li>`).join('');
  }

  function updateMp3Label() {
    const name = mp3.tracks.length ? mp3.tracks[mp3.index].name : 'No songs yet';
    const status = mp3.error || name;
    if ($('mp3-track')) $('mp3-track').textContent = status;
    if ($('music-now')) $('music-now').textContent = status;
    if ($('mp3-emoji')) $('mp3-emoji').classList.toggle('spin', mp3.playing);
    const mark = mp3.playing ? '⏸' : '▶';
    if ($('mp3-play')) $('mp3-play').textContent = mark;
    if ($('music-play')) $('music-play').textContent = mark;
    const err = $('music-error');
    if (err) {
      err.hidden = !mp3.error;
      err.textContent = mp3.error || '';
    }
    renderMusicList();
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
