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
    hof:        $('screen-hof'),
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
    const board = $('photo-board');
    if (board) board.hidden = name !== 'home' || !board.childElementCount;
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
      status:            f.status || 'active',
    };
  }

  function showUnavailable({ title, subtitle, message, heroImage }) {
    document.title = title;
    const emoji = ((state.config && state.config.meta) || {}).headerEmoji || '';
    if ($('home-emoji')) $('home-emoji').textContent = emoji;
    if ($('home-name')) $('home-name').textContent = title;
    if ($('home-kicker')) $('home-kicker').textContent = subtitle || '';
    if ($('home-description')) $('home-description').textContent = message || '';
    if ($('home-nav')) $('home-nav').innerHTML = '';
    buildPhotoBoard((state.config && state.config.ecard) || {});
    applyPageBackground(heroImage);
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

  function applyPageBackground(src) {
    const url = String(src || '').trim();
    document.body.classList.toggle('has-page-bg', !!url);
    if (url) {
      document.body.style.setProperty('--page-bg-image', 'url("' + url.replace(/"/g, '\\"') + '")');
    } else {
      document.body.style.removeProperty('--page-bg-image');
    }
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

  function galleryItems(ecard) {
    const photos = (ecard && Array.isArray(ecard.photos)) ? ecard.photos : [];
    return photos.filter((p) => p && p.src);
  }

  function buildPhotoBoard(ecard) {
    const board = $('photo-board');
    if (!board) return;
    const photos = (ecard && Array.isArray(ecard.photos)) ? ecard.photos.slice(0, 6) : [];
    board.innerHTML = '';
    photos.forEach((p, i) => {
      if (!p || !p.src) return;
      const fig = document.createElement('figure');
      fig.className = 'polaroid pos-' + (i + 1);
      const caption = p.caption ? escHtml(p.caption) : '';
      const src = escHtml(p.src);
      const media = isVideoSrc(p.src)
        ? `<video src="${src}" muted playsinline autoplay loop></video>`
        : `<img src="${src}" alt="${caption}" />`;
      fig.innerHTML =
        `<div class="polaroid-photo">${media}</div>` +
        (caption ? `<figcaption>${caption}</figcaption>` : '');
      board.appendChild(fig);
    });
    board.hidden = !board.childElementCount;
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
    applyPageBackground(meta.bgImage || meta.heroImage);
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
    setupMp3Player();
    wireEvents();
    if (guestFlags().enableGallery) {
      try { await loadGalleryItems(); } catch { state.galleryItems = null; }
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
    applyPageBackground(meta.bgImage || meta.heroImage);
    buildPhotoBoard(ecard);
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

    const hero = $('home-hero');
    if (hero) {
      hero.hidden = true;
      hero.removeAttribute('src');
    }

    const nav = $('home-nav');
    if (!nav) return;
    nav.innerHTML = '';

    const tiles = [];
    if (f.enableQuiz) {
      tiles.push({
        id: 'quiz',
        emoji: '❓',
        title: 'Quiz',
        hint: meta.title ? `Play “${meta.title}”` : 'Test what you know',
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
        else if (t.id === 'guestbook') openGuestbook();
        else if (t.id === 'gallery') openGallery();
        else if (t.id === 'hof') openHof();
      });
      nav.appendChild(btn);
    });
  }

  function goHome() {
    renderHome();
    showScreen('home');
  }

  function openQuiz() {
    if (state.guestbookName && $('player-name') && !$('player-name').value) {
      $('player-name').value = state.guestbookName;
    }
    showScreen('welcome');
    if (guestFlags().enableQuiz) setTimeout(() => $('player-name') && $('player-name').focus(), 300);
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

  function showLightboxItem(index) {
    const items = state.galleryItems || [];
    if (!items.length) return;
    const next = (index + items.length) % items.length;
    state.lightboxIndex = next;
    const item = items[next];
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
    showLightboxItem(Number(btn.getAttribute('data-gallery-open')) || 0);
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
    $('nav-home')?.addEventListener('click', goHome);
    $('results-home')?.addEventListener('click', goHome);
    $('guestbook-form')?.addEventListener('submit', onGuestbookSubmit);
    $('gallery-form')?.addEventListener('submit', onGallerySubmit);
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
    const value = String(name || '');
    if (/^(https?:)?\//.test(value)) return value;
    return '/music/' + encodeURIComponent(value);
  }

  function mp3Label(src) {
    let base = String(src || '').split('/').pop() || 'Track';
    try { base = decodeURIComponent(base); } catch { /* keep */ }
    return base.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ') || 'Track';
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
        name: mp3Label(f),
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
