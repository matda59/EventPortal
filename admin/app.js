/* =====================================================================
   Event Portal — Admin dashboard
   Cookie-gated CRUD for events, quizzes, questions, and media volumes.
   ===================================================================== */

(function () {
  'use strict';

  const COLOR_THEMES = {
    pink: {
      label: 'Pink',
      theme: {
        primaryRed:    '#C2185B',
        accentOrange:  '#EC407A',
        highlightPink: '#F48FB1',
        bgEarth:       '#FDF4F7',
        surfaceCard:   '#FFFFFF',
        textDark:      '#3A1528',
      },
    },
    blue: {
      label: 'Blue',
      theme: {
        primaryRed:    '#1565C0',
        accentOrange:  '#1E88E5',
        highlightPink: '#64B5F6',
        bgEarth:       '#F3F8FC',
        surfaceCard:   '#FFFFFF',
        textDark:      '#0D2137',
      },
    },
    gold: {
      label: 'Gold',
      theme: {
        primaryRed:    '#B8860B',
        accentOrange:  '#D4A017',
        highlightPink: '#E8C547',
        bgEarth:       '#FBF6EA',
        surfaceCard:   '#FFFFFF',
        textDark:      '#2C2410',
      },
    },
    silver: {
      label: 'Silver',
      theme: {
        primaryRed:    '#5A6570',
        accentOrange:  '#8A96A3',
        highlightPink: '#B7C0C8',
        bgEarth:       '#F5F6F8',
        surfaceCard:   '#FFFFFF',
        textDark:      '#1C2328',
      },
    },
    rose: {
      label: 'Rose',
      theme: {
        primaryRed:    '#8B2942',
        accentOrange:  '#C4A574',
        highlightPink: '#D4A5B8',
        bgEarth:       '#F7F3EE',
        surfaceCard:   '#FFFFFF',
        textDark:      '#2C2428',
      },
    },
    navy: {
      label: 'Navy',
      theme: {
        primaryRed:    '#1B3A5F',
        accentOrange:  '#3D6B99',
        highlightPink: '#7FA3C4',
        bgEarth:       '#F3F5F8',
        surfaceCard:   '#FFFFFF',
        textDark:      '#121A26',
      },
    },
    forest: {
      label: 'Forest',
      theme: {
        primaryRed:    '#165B3A',
        accentOrange:  '#3D8B5C',
        highlightPink: '#C4A35A',
        bgEarth:       '#F3F0E7',
        surfaceCard:   '#FFFFFF',
        textDark:      '#1F2A24',
      },
    },
    sunset: {
      label: 'Sunset',
      theme: {
        primaryRed:    '#B83B26',
        accentOrange:  '#D96B27',
        highlightPink: '#D86B81',
        bgEarth:       '#FBF6EF',
        surfaceCard:   '#FFFFFF',
        textDark:      '#2B2121',
      },
    },
  };

  const DEFAULT_THEME = Object.assign({}, COLOR_THEMES.pink.theme);
  const DEFAULT_EVENT = {
    status: 'draft',
    enableQuiz: true,
    enableLeaderboard: true,
    enableGallery: true,
    enableMusic: true,
    enableGuestbook: true,
    occasionType: 'Birthday',
    themePreset: 'pink',
    theme: DEFAULT_THEME,
  };

  const OCCASIONS = [
    { value: 'Birthday' },
    { value: 'Wedding' },
    { value: 'Anniversary' },
    { value: 'Retirement' },
    { value: 'Kids party' },
    { value: 'Holiday' },
  ];

  const HEADER_EMOJIS = [
    '🎉', '🥳', '🎈', '🎂', '🎁', '🥂', '🍾',
    '💍', '💐', '💕', '💖', '🌹', '💒',
    '🌅', '🎄', '❄️', '🦄', '⭐', '✨',
    '🎓', '👶', '🏠', '⛳', '🎵', '📸', '👑',
  ];

  const THEME_FIELDS = [
    ['primaryRed',    'Primary'],
    ['accentOrange',  'Accent'],
    ['highlightPink', 'Highlight'],
    ['bgEarth',       'Background'],
    ['surfaceCard',   'Card'],
    ['textDark',      'Text'],
  ];

  const DEFAULT_TIERS = [
    { minPercent: 0,  maxPercent: 40,  title: 'Getting started', message: 'A warm-up round — try again!' },
    { minPercent: 41, maxPercent: 75,  title: 'Solid effort',    message: 'You know them pretty well.' },
    { minPercent: 76, maxPercent: 89,  title: 'Close friend',    message: 'Impressive — only a few slipped by.' },
    { minPercent: 90, maxPercent: 100, title: 'Inner circle',    message: 'Legendary score.' },
  ];

  const state = {
    authed: false,
    view: 'events',
    eventId: null,
    tab: 'event',
    events: [],
    detail: null,
    media: { images: [], music: [] },
    picker: null,
    busy: false,
  };

  const $app   = document.getElementById('app');
  const $toast = document.getElementById('toast');
  const $modal = document.getElementById('modal-root');

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(msg, kind) {
    $toast.textContent = msg;
    $toast.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { $toast.className = 'toast'; }, 2800);
  }

  function introPreviewHtml(ecard, opts) {
    const mini = opts && opts.mini;
    const photos = Array.from({ length: 6 }, (_, i) => (ecard && ecard.photos && ecard.photos[i]) || { src: '', caption: '' });
    const greeting = (ecard && ecard.greeting) || 'Happy Birthday!';
    const sub = (ecard && ecard.subGreeting) || 'A short tagline';
    const msg = (ecard && ecard.message) || 'Your welcome note appears here.';
    const btn = (ecard && ecard.buttonText) || 'Start the Quiz →';
    const polaroids = photos.map((p, i) => `
      <figure class="intro-polaroid intro-pos-${i + 1}" data-preview-photo="${i}">
        <div class="intro-polaroid-photo">${p.src ? `<img src="${esc(p.src)}" alt="">` : ''}</div>
        <figcaption>${esc(p.caption || 'Photo ' + (i + 1))}</figcaption>
      </figure>`).join('');
    return `
      <div class="intro-preview ${mini ? 'intro-preview-mini' : ''}" aria-hidden="true">
        <div class="intro-preview-stage">
          ${polaroids}
          <div class="intro-preview-card">
            <div class="intro-preview-confetti">✨🎉✨</div>
            <div class="intro-preview-headline" id="preview-greeting">${esc(greeting)}</div>
            <div class="intro-preview-tag" id="preview-sub">${esc(sub)}</div>
            <div class="intro-preview-note" id="preview-msg">${esc(msg)}</div>
            <div class="intro-preview-btn" id="preview-btn">${esc(btn)}</div>
          </div>
        </div>
      </div>`;
  }

  async function api(path, opts) {
    const res = await fetch('/api/admin' + path, {
      credentials: 'same-origin',
      ...opts,
      headers: {
        ...(opts && opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(opts && opts.headers),
      },
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (res.status === 401) {
      state.authed = false;
      if (path !== '/session' && path !== '/login') render();
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function slugify(name) {
    return String(name || '').toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  }

  function parseRoute() {
    const parts = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    // ['admin'] | ['admin','media'] | ['admin','new'] | ['admin','events', id]
    state.view = 'events';
    state.eventId = null;
    if (parts[1] === 'media') state.view = 'media';
    else if (parts[1] === 'new') { state.view = 'editor'; state.eventId = 'new'; }
    else if (parts[1] === 'events' && parts[2]) { state.view = 'editor'; state.eventId = parts[2]; }
  }

  function go(path) {
    if (location.pathname !== path) history.pushState(null, '', path);
    parseRoute();
    loadView();
  }

  window.addEventListener('popstate', () => { parseRoute(); loadView(); });

  function nav(active) {
    return `
      <aside class="sidebar">
        <div class="brand">Event Portal</div>
        <button class="nav-link ${active === 'events' ? 'active' : ''}" data-go="/admin">Events</button>
        <button class="nav-link ${active === 'media' ? 'active' : ''}" data-go="/admin/media">Media library</button>
        <div class="sidebar-spacer"></div>
        <button class="nav-link" id="logout-btn" type="button">Log out</button>
      </aside>`;
  }

  function val(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function readThemeFromForm() {
    const theme = {};
    THEME_FIELDS.forEach(([key]) => {
      const v = val('theme-' + key);
      if (v) theme[key] = v;
    });
    return theme;
  }

  function hexEq(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function themesEqual(a, b) {
    return THEME_FIELDS.every(([key]) => hexEq(a && a[key], b && b[key]));
  }

  function resolveColorThemeId(ev) {
    const theme = ev && ev.theme;
    if (theme) {
      const match = Object.entries(COLOR_THEMES).find(([, p]) => themesEqual(p.theme, theme));
      if (match) return match[0];
    }
    const id = ev && ev.themePreset;
    if (id && COLOR_THEMES[id]) return id;
    return 'custom';
  }

  // ── Login ──────────────────────────────────────────────────────────
  function renderLogin() {
    $app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="login-form">
          <h1>Admin sign in</h1>
          <p>Enter the <code>ADMIN_TOKEN</code> set on the server. Public quizzes at <code>/e/:slug</code> stay open.</p>
          <label for="admin-token">Admin token</label>
          <input id="admin-token" class="text-input" type="password" autocomplete="current-password" required minlength="8" />
          <p id="login-error" class="login-error" hidden></p>
          <button class="btn btn-primary" type="submit" style="width:100%;margin-top:18px">Sign in</button>
        </form>
      </div>`;
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      errEl.hidden = true;
      try {
        await api('/login', { method: 'POST', body: JSON.stringify({ token: val('admin-token') }) });
        state.authed = true;
        parseRoute();
        render();
        loadView();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    });
  }

  // ── Events list ────────────────────────────────────────────────────
  function renderEvents() {
    const cards = state.events.length ? state.events.map((ev) => `
      <article class="card">
        <div class="row" style="justify-content:space-between">
          <h2>${esc(ev.headerEmoji || '')} ${esc(ev.name)}</h2>
          <span class="pill pill-${esc(ev.status)}">${esc(ev.status)}</span>
        </div>
        <p class="meta" style="margin-top:6px">
          <a href="/e/${esc(ev.slug)}" target="_blank" rel="noopener">/e/${esc(ev.slug)}</a>
          · ${esc(ev.occasionType || 'Occasion')}
          ${ev.eventDate ? ' · ' + esc(ev.eventDate) : ''}
        </p>
        <p class="meta" style="margin-top:8px">
          ${ev.enableQuiz ? 'Quiz on' : 'Quiz off'}
          · ${ev.enableGallery !== false ? 'Photos on' : 'Photos off'}
          · ${ev.enableMusic !== false ? 'Music on' : 'Music off'}
          · ${ev.enableLeaderboard ? 'Hall of Fame on' : 'Hall of Fame off'}
          · ${ev.enableGuestbook ? 'Guest book on' : 'Guest book off'}
          · ${ev.questionCount || 0} question${ev.questionCount === 1 ? '' : 's'}
          · ${ev.scoreCount || 0} score${ev.scoreCount === 1 ? '' : 's'}
        </p>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" data-go="/admin/events/${esc(ev.id)}">Edit</button>
          <a class="btn btn-ghost btn-sm" href="/e/${esc(ev.slug)}" target="_blank" rel="noopener">Open quiz</a>
          <button class="btn btn-ghost btn-sm" type="button" data-copy="/e/${esc(ev.slug)}">Copy link</button>
          <button class="btn btn-ghost btn-sm" type="button" data-qr="/e/${esc(ev.slug)}" data-qr-name="${esc(ev.name)}">QR</button>
          <button class="btn btn-ghost btn-sm" type="button" data-duplicate="${esc(ev.id)}">Duplicate</button>
          <button class="btn btn-ghost btn-sm" data-delete-event="${esc(ev.id)}" data-slug="${esc(ev.slug)}">Delete</button>
        </div>
      </article>`).join('') : '<p class="empty">No events yet. Create one to get a public quiz at /e/your-slug.</p>';

    $app.innerHTML = `
      <div class="shell">
        ${nav('events')}
        <main class="content">
          <div class="page-head">
            <div>
              <h1>Events</h1>
              <p class="sub">Each event is a public quiz at <code>/e/:slug</code>.</p>
            </div>
            <button class="btn btn-primary" data-go="/admin/new">New event</button>
          </div>
          <div class="grid grid-2">${cards}</div>
        </main>
      </div>`;
    bindShell();
    $app.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = location.origin + btn.getAttribute('data-copy');
        try {
          await navigator.clipboard.writeText(url);
          toast('Copied guest link');
        } catch {
          toast(url);
        }
      });
    });
    $app.querySelectorAll('[data-qr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        showQrModal(location.origin + btn.getAttribute('data-qr'), btn.getAttribute('data-qr-name') || 'Event');
      });
    });
    $app.querySelectorAll('[data-duplicate]').forEach((btn) => {
      btn.addEventListener('click', () => duplicateEvent(btn.getAttribute('data-duplicate')));
    });
    $app.querySelectorAll('[data-delete-event]').forEach((btn) => {
      btn.addEventListener('click', () => deleteEvent(btn.getAttribute('data-delete-event'), btn.getAttribute('data-slug')));
    });
  }

  async function deleteEvent(id, slug) {
    const typed = prompt(`Delete this event and its quiz, questions, and scores?\nType the slug to confirm:`, '');
    if (typed !== slug) return;
    try {
      await api('/events/' + id, { method: 'DELETE' });
      toast('Event deleted');
      state.events = state.events.filter((e) => e.id !== id);
      renderEvents();
    } catch (err) { toast(err.message, 'err'); }
  }

  async function duplicateEvent(id) {
    try {
      const created = await api('/events/' + id + '/duplicate', { method: 'POST' });
      toast('Copied as a draft — edit before going live');
      go('/admin/events/' + created.event.id);
    } catch (err) { toast(err.message, 'err'); }
  }

  function qrImageUrl(text) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(text);
  }

  function showQrModal(url, title) {
    $modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal>
        <div class="modal qr-modal" role="dialog" aria-label="QR code">
          <h2>${esc(title)}</h2>
          <p class="hint">Guests scan this to open the event. Print it for the night.</p>
          <img class="qr-img" src="${esc(qrImageUrl(url))}" alt="QR code for ${esc(url)}" width="240" height="240" />
          <p class="qr-url"><code>${esc(url)}</code></p>
          <div class="row" style="justify-content:center;gap:8px;margin-top:14px">
            <button class="btn btn-primary" type="button" id="qr-print">Print</button>
            <button class="btn btn-ghost" type="button" id="qr-copy">Copy link</button>
            <button class="btn btn-ghost" type="button" data-close-modal>Close</button>
          </div>
        </div>
      </div>`;
    $modal.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target === el) $modal.innerHTML = '';
      });
    });
    document.getElementById('qr-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); toast('Copied guest link'); }
      catch { toast(url); }
    });
    document.getElementById('qr-print')?.addEventListener('click', () => {
      const w = window.open('', '_blank', 'width=420,height=560');
      if (!w) { toast('Allow pop-ups to print', 'err'); return; }
      w.document.write(`<!DOCTYPE html><html><head><title>${esc(title)} QR</title>
        <style>body{font-family:Segoe UI,sans-serif;text-align:center;padding:32px} img{width:280px;height:280px} code{font-size:13px}</style>
        </head><body><h1>${esc(title)}</h1><img src="${esc(qrImageUrl(url))}" alt="QR"><p><code>${esc(url)}</code></p></body></html>`);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    });
  }

  // ── Editor ─────────────────────────────────────────────────────────
  function eventFields(ev, isNew) {
    const theme = Object.assign({}, DEFAULT_THEME, ev.theme || {});
    const selectedTheme = resolveColorThemeId(ev);
    const colors = THEME_FIELDS.map(([key, label]) => `
      <div class="field">
        <label>${esc(label)}</label>
        <div class="color-row">
          <input type="color" id="theme-${key}-picker" value="${esc(theme[key] || '#000000')}" data-sync="theme-${key}" />
          <input type="text" id="theme-${key}" value="${esc(theme[key] || '')}" />
        </div>
      </div>`).join('');
    const themeCards = Object.entries(COLOR_THEMES).map(([id, p]) => {
      const t = p.theme;
      return `
        <button type="button" class="theme-card ${selectedTheme === id ? 'selected' : ''}" data-theme="${esc(id)}" role="radio" aria-checked="${selectedTheme === id ? 'true' : 'false'}">
          <span class="theme-swatch" aria-hidden="true">
            <span style="background:${esc(t.primaryRed)}"></span>
            <span style="background:${esc(t.accentOrange)}"></span>
            <span style="background:${esc(t.highlightPink)}"></span>
            <span style="background:${esc(t.bgEarth)}"></span>
          </span>
          <strong>${esc(p.label)}</strong>
        </button>`;
    }).join('');

    return `
      <div class="form-grid">
        <div class="field span-2">
          <label for="ev-name">Name</label>
          <input id="ev-name" value="${esc(ev.name || '')}" ${isNew ? 'data-slug-source' : ''} required />
        </div>
        <div class="field span-2">
          <label for="ev-description">Description</label>
          <textarea id="ev-description" placeholder="A short welcome guests see on the event home page.">${esc(ev.description || '')}</textarea>
        </div>
        <div class="field">
          <label for="ev-slug">Slug (public URL)</label>
          <input id="ev-slug" value="${esc(ev.slug || '')}" required />
        </div>
        <div class="field">
          <label for="ev-occasion">Occasion</label>
          <select id="ev-occasion">
            ${OCCASIONS.map((o) =>
              `<option value="${esc(o.value)}" ${(ev.occasionType || 'Birthday') === o.value ? 'selected' : ''}>${esc(o.value)}</option>`).join('')}
            <option value="Other" ${ev.occasionType && !OCCASIONS.some((o) => o.value === ev.occasionType) ? 'selected' : ''}>Other</option>
          </select>
        </div>
        <div class="field" id="ev-occasion-custom-wrap" ${ev.occasionType && !OCCASIONS.some((o) => o.value === ev.occasionType) ? '' : 'hidden'}>
          <label for="ev-occasion-custom">Custom occasion</label>
          <input id="ev-occasion-custom" value="${esc(ev.occasionType && !OCCASIONS.some((o) => o.value === ev.occasionType) ? ev.occasionType : '')}" placeholder="Engagement, christening…" />
        </div>
        <div class="field">
          <label for="ev-date">Event date</label>
          <input id="ev-date" type="date" value="${esc(ev.eventDate || '')}" />
        </div>
        <div class="field">
          <label for="ev-status">Status</label>
          <select id="ev-status">
            ${['draft', 'active', 'ended'].map((s) =>
              `<option value="${s}" ${ev.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="field span-2">
          <label>Header emoji</label>
          <p class="hint">Shown next to the event name. Tap one below — you do not type it.</p>
          <input type="hidden" id="ev-emoji" value="${esc(ev.headerEmoji || '🎉')}" />
          <div class="emoji-grid" id="emoji-grid" role="listbox" aria-label="Header emoji">
            ${HEADER_EMOJIS.map((em) =>
              `<button type="button" class="emoji-pick ${(ev.headerEmoji || '🎉') === em ? 'selected' : ''}" data-emoji="${esc(em)}" aria-pressed="${(ev.headerEmoji || '🎉') === em ? 'true' : 'false'}">${em}</button>`).join('')}
          </div>
        </div>
        <p class="hint span-2">draft is hidden from guests. active is live at /e/slug. ended shows “this event has ended”.</p>
        <div class="span-2">
          <h2 class="section-title">Guest features</h2>
          <p class="hint">Turn on what guests can open from the event home page.</p>
          <div class="feature-grid">
            <label class="feature-card">
              <input type="checkbox" id="ev-quiz" ${ev.enableQuiz !== false ? 'checked' : ''} />
              <span>
                <strong>Quiz</strong>
                <small>Name form and questions</small>
              </span>
            </label>
            <label class="feature-card">
              <input type="checkbox" id="ev-gallery" ${ev.enableGallery !== false ? 'checked' : ''} />
              <span>
                <strong>Photo &amp; video gallery</strong>
                <small>Photos and videos from the event home page</small>
              </span>
            </label>
            <label class="feature-card">
              <input type="checkbox" id="ev-music" ${ev.enableMusic !== false ? 'checked' : ''} />
              <span>
                <strong>Music player</strong>
                <small>Guest playlist of uploaded MP3s</small>
              </span>
            </label>
            <label class="feature-card">
              <input type="checkbox" id="ev-hof" ${ev.enableLeaderboard !== false ? 'checked' : ''} />
              <span>
                <strong>Hall of Fame</strong>
                <small>Quiz leaderboard from the event home page</small>
              </span>
            </label>
            <label class="feature-card">
              <input type="checkbox" id="ev-guestbook" ${ev.enableGuestbook ? 'checked' : ''} />
              <span>
                <strong>Guest book</strong>
                <small>Guests sign their name and leave a message</small>
              </span>
            </label>
          </div>
          ${introPreviewHtml(null, { mini: true })}
          <p class="hint">Guests land on a home page with the event name, description, and tiles for each feature you turn on. Photos live in the gallery from that home page — add them on the Intro tab after you save.</p>
        </div>
        <div class="span-2">
          <h2 class="section-title">Colour theme</h2>
          <p class="hint">Pick a look for the public quiz. Open Advanced if you want to tweak individual colours.</p>
          <input type="hidden" id="ev-preset" value="${esc(selectedTheme)}" />
          <div class="theme-grid" id="theme-grid" role="radiogroup" aria-label="Colour theme">
            ${themeCards}
            <button type="button" class="theme-card ${selectedTheme === 'custom' ? 'selected' : ''}" data-theme="custom" role="radio" aria-checked="${selectedTheme === 'custom' ? 'true' : 'false'}">
              <span class="theme-swatch" aria-hidden="true">
                <span style="background:${esc(theme.primaryRed)}"></span>
                <span style="background:${esc(theme.accentOrange)}"></span>
                <span style="background:${esc(theme.highlightPink)}"></span>
                <span style="background:${esc(theme.bgEarth)}"></span>
              </span>
              <strong>Custom</strong>
            </button>
          </div>
        </div>
        <details class="advanced-colors span-2" id="advanced-colors" ${selectedTheme === 'custom' ? 'open' : ''}>
          <summary>Advanced colours</summary>
          <p class="hint">These fill in from the theme above. Changing them switches the event to Custom.</p>
          <div class="form-grid">${colors}</div>
        </details>
      </div>
      <div class="row" style="margin-top:18px">
        <button class="btn btn-primary" id="save-event" type="button">${isNew ? 'Create event' : 'Save event'}</button>
      </div>`;
  }

  function quizFields(quiz) {
    const q = quiz || {};
    const audio = q.audio || {};
    const ecard = q.ecard || {};
    const photos = Array.from({ length: 6 }, (_, i) => (ecard.photos && ecard.photos[i]) || { src: '', caption: '' });
    const tiers = (q.scoreTiers && q.scoreTiers.length) ? q.scoreTiers : [{ minPercent: 0, maxPercent: 100, title: '', message: '' }];
    const musicOpts = (name) => {
      const cur = name || '';
      const files = state.media.music || [];
      const extra = cur && !files.some((f) => f.name === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : '';
      return `<option value="">None</option>${extra}` + files.map((f) =>
        `<option value="${esc(f.name)}" ${f.name === cur ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
    };

    function playlistPicker(selected) {
      const picked = new Set((Array.isArray(selected) ? selected : []).map(String));
      const files = state.media.music || [];
      if (!files.length && !picked.size) {
        return '<p class="hint">Upload MP3s under Media, then tick them here.</p>';
      }
      const extra = [...picked].filter((n) => n && !files.some((f) => f.name === n));
      const items = files.map((f) => f.name).concat(extra);
      return `<div class="playlist-picks">${items.map((name) => `
        <label class="check playlist-check">
          <input type="checkbox" class="playlist-track" value="${esc(name)}" ${picked.has(name) ? 'checked' : ''} />
          ${esc(name)}
        </label>`).join('')}</div>`;
    }

    return `
      <h2 class="section-title">Quiz copy</h2>
      <div class="form-grid">
        <div class="field span-2">
          <label for="quiz-title">Title</label>
          <input id="quiz-title" value="${esc(q.title || '')}" />
        </div>
        <div class="field">
          <label for="quiz-subtitle">Subtitle</label>
          <input id="quiz-subtitle" value="${esc(q.subtitle || '')}" />
        </div>
        <div class="field">
          <label for="quiz-honoree">Honoree</label>
          <input id="quiz-honoree" value="${esc(q.honoree || '')}" />
        </div>
        <div class="field span-2">
          <label for="quiz-welcome">Welcome message</label>
          <textarea id="quiz-welcome">${esc(q.welcomeMessage || '')}</textarea>
        </div>
        <div class="field span-2">
          <label>Hero image</label>
          <div class="path-pick">
            <input id="quiz-hero" value="${esc(q.heroImage || '')}" placeholder="/images/photo.jpg" />
            <button class="btn btn-ghost" type="button" data-pick="image" data-target="quiz-hero">Browse</button>
          </div>
        </div>
      </div>

      <h2 class="section-title" style="margin-top:28px">Audio cues</h2>
      <p class="hint">Sound effects for this quiz. Guests only hear the guest playlist below — not every MP3 on the host.</p>
      <div class="form-grid">
        <div class="field">
          <label for="audio-bg">Background</label>
          <select id="audio-bg">${musicOpts(audio.backgroundMusic)}</select>
        </div>
        <div class="field">
          <label for="audio-ok">Correct</label>
          <select id="audio-ok">${musicOpts(audio.correctSound)}</select>
        </div>
        <div class="field">
          <label for="audio-bad">Wrong</label>
          <select id="audio-bad">${musicOpts(audio.wrongSound)}</select>
        </div>
      </div>

      <h2 class="section-title" style="margin-top:28px">Guest playlist</h2>
      <p class="hint">Tick the tracks that should appear in this event’s public player. Shown to guests when Music player is on. Background music is included automatically.</p>
      ${playlistPicker(audio.playlist)}

      <h2 class="section-title" style="margin-top:28px">Opening welcome screen</h2>
      <p class="hint">This is the first screen guests see: a welcome card in the middle, with up to six Polaroid photos floating around it. The sketch below updates as you type.</p>
      ${introPreviewHtml(ecard)}
      <div class="form-grid">
        <div class="field">
          <label for="ecard-greeting">Headline</label>
          <input id="ecard-greeting" value="${esc(ecard.greeting || '')}" placeholder="Happy Birthday, Naomi!" />
        </div>
        <div class="field">
          <label for="ecard-sub">Tagline</label>
          <input id="ecard-sub" value="${esc(ecard.subGreeting || '')}" placeholder="Four fabulous decades" />
        </div>
        <div class="field span-2">
          <label for="ecard-message">Welcome note</label>
          <textarea id="ecard-message" placeholder="A short message guests read before the quiz or guest book.">${esc(ecard.message || '')}</textarea>
        </div>
        <div class="field span-2">
          <label for="ecard-btn">Button on the card</label>
          <input id="ecard-btn" value="${esc(ecard.buttonText || '')}" placeholder="Start the Quiz →" />
        </div>
      </div>
      <p class="hint" style="margin-top:12px">Add up to six Polaroid photos. They appear around the welcome card — not in a row on this form. Browse from the media library.</p>
      <div class="grid" id="ecard-photos">
        ${photos.map((p, i) => `
          <div class="card">
            <div class="field">
              <label>Photo ${i + 1}</label>
              <div class="path-pick">
                <input id="photo-src-${i}" value="${esc(p.src || '')}" placeholder="/images/…" />
                <button class="btn btn-ghost btn-sm" type="button" data-pick="image" data-target="photo-src-${i}">Browse</button>
              </div>
            </div>
            <div class="field" style="margin-top:8px">
              <label for="photo-cap-${i}">Caption</label>
              <input id="photo-cap-${i}" value="${esc(p.caption || '')}" />
            </div>
          </div>`).join('')}
      </div>

      <h2 class="section-title" style="margin-top:28px">Score tiers</h2>
      <p class="hint">Guests land on the first tier whose percent range includes their score.</p>
      <div id="tier-list">${tiers.map((t, i) => tierRow(t, i)).join('')}</div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-ghost btn-sm" type="button" id="add-tier">Add tier</button>
        <button class="btn btn-ghost btn-sm" type="button" id="default-tiers">Insert defaults</button>
      </div>
      <div class="row" style="margin-top:22px">
        <button class="btn btn-primary" id="save-quiz" type="button">Save quiz</button>
      </div>`;
  }

  function tierRow(t, i) {
    return `
      <div class="card" data-tier="${i}" style="margin-bottom:10px">
        <div class="form-grid">
          <div class="field"><label>Min %</label><input type="number" min="0" max="100" class="tier-min" value="${esc(t.minPercent)}" /></div>
          <div class="field"><label>Max %</label><input type="number" min="0" max="100" class="tier-max" value="${esc(t.maxPercent)}" /></div>
          <div class="field span-2"><label>Title</label><input class="tier-title" value="${esc(t.title || '')}" /></div>
          <div class="field span-2"><label>Message</label><input class="tier-message" value="${esc(t.message || '')}" /></div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-remove-tier style="margin-top:10px">Remove</button>
      </div>`;
  }

  function questionCard(q, index, total) {
    const options = (q.options && q.options.length ? q.options : ['', '', '', '']).slice();
    while (options.length < 2) options.push('');
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    return `
      <article class="card q-card" data-qid="${esc(q.id)}">
        <div class="q-head">
          <h3>Question ${index + 1}</h3>
          <div class="row">
            <button class="btn btn-ghost btn-sm" type="button" data-move="up" ${index === 0 ? 'disabled' : ''}>Up</button>
            <button class="btn btn-ghost btn-sm" type="button" data-move="down" ${index === total - 1 ? 'disabled' : ''}>Down</button>
            <button class="btn btn-danger btn-sm" type="button" data-del-q>Delete</button>
          </div>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label>Question</label>
            <textarea class="q-text">${esc(q.question || '')}</textarea>
          </div>
          <div class="field">
            <label>Asked by</label>
            <input class="q-by" value="${esc(q.submittedBy || '')}" />
          </div>
          <div class="field">
            <label>Type</label>
            <select class="q-type">
              <option value="text" ${q.type !== 'photo' ? 'selected' : ''}>Text</option>
              <option value="photo" ${q.type === 'photo' ? 'selected' : ''}>Photo</option>
            </select>
          </div>
          <div class="field span-2">
            <label>Image</label>
            <div class="path-pick">
              <input class="q-image" value="${esc(q.image || '')}" placeholder="/images/…" />
              <button class="btn btn-ghost btn-sm" type="button" data-pick="image" data-target-class="q-image">Browse</button>
            </div>
          </div>
          <div class="field">
            <label>Fun fact (shown after answer)</label>
            <input class="q-fact" value="${esc(q.funFact || '')}" />
          </div>
          <div class="field">
            <label>Audio clip</label>
            <input class="q-audio" value="${esc(q.audioClip || '')}" placeholder="optional.mp3" />
          </div>
        </div>
        <p class="hint" style="margin-top:12px">Select the radio next to the correct answer.</p>
        <div class="options-edit">
          ${options.map((opt, i) => `
            <div class="opt-row">
              <input type="radio" name="correct-${esc(q.id)}" ${Number(q.correctIndex) === i ? 'checked' : ''} />
              <input class="q-opt" value="${esc(opt)}" placeholder="Option ${letters[i] || i + 1}" />
              <button class="btn btn-ghost btn-sm" type="button" data-remove-opt ${options.length <= 2 ? 'disabled' : ''}>Remove</button>
            </div>`).join('')}
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-ghost btn-sm" type="button" data-add-opt>Add option</button>
          <button class="btn btn-primary btn-sm" type="button" data-save-q>Save question</button>
        </div>
      </article>`;
  }

  function scoresPanel(data) {
    if (!data) return '<p class="meta">Loading scores…</p>';
    const rows = data.scores || [];
    const table = rows.length ? `
      <div class="table-wrap">
        <table class="scores-table">
          <thead><tr><th>#</th><th>Name</th><th>Score</th><th>%</th><th>When</th></tr></thead>
          <tbody>
            ${rows.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${esc(s.name)}</td>
                <td>${s.score} / ${s.totalQuestions}</td>
                <td>${s.percent}%</td>
                <td class="meta">${esc(formatScoreDate(s.createdAt))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p class="empty">No scores yet. Play the public quiz to populate the Hall of Fame.</p>';

    return `
      <div class="row" style="justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <p class="hint" style="margin:0">${data.count || 0} player${(data.count || 0) === 1 ? '' : 's'}</p>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-sm" type="button" id="scores-csv" ${rows.length ? '' : 'disabled'}>Download CSV</button>
          <button class="btn btn-ghost btn-sm" type="button" id="scores-reset" ${rows.length ? '' : 'disabled'}>Reset scores</button>
        </div>
      </div>
      ${table}`;
  }

  function guestbookPanel(data) {
    if (!data) return '<p class="meta">Loading guest book…</p>';
    const rows = data.entries || [];
    const list = rows.length ? `
      <div class="gb-admin-list">
        ${rows.map((e) => `
          <article class="card">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div>
                <strong>${esc(e.name)}</strong>
                <p class="meta">${esc(formatScoreDate(e.createdAt))}</p>
                <p style="margin-top:8px">${esc(e.message)}</p>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" data-del-gb="${esc(e.id)}">Delete</button>
            </div>
          </article>`).join('')}
      </div>` : '<p class="empty">No messages yet. Guests sign when Guest book is turned on.</p>';
    return `
      <p class="hint">Messages guests left on the public page. Delete anything you do not want shown.</p>
      ${list}`;
  }

  function formatScoreDate(iso) {
    if (!iso) return '';
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-AU');
  }

  async function loadScores() {
    try {
      const data = await api('/events/' + state.eventId + '/scores');
      if (state.detail) {
        state.detail.scores = data;
        if (state.detail.event) state.detail.event.scoreCount = data.count;
      }
    } catch (err) {
      toast(err.message, 'err');
      if (state.detail) state.detail.scores = { count: 0, scores: [] };
    }
  }

  async function loadGuestbook() {
    try {
      const data = await api('/events/' + state.eventId + '/guestbook');
      if (state.detail) {
        state.detail.guestbook = data;
        if (state.detail.event) state.detail.event.guestbookCount = data.count;
      }
    } catch (err) {
      toast(err.message, 'err');
      if (state.detail) state.detail.guestbook = { count: 0, entries: [] };
    }
  }

  function downloadScoresCsv() {
    const rows = (state.detail && state.detail.scores && state.detail.scores.scores) || [];
    const slug = (state.detail && state.detail.event && state.detail.event.slug) || 'event';
    const lines = ['Name,Score,Total,Percent,Submitted'];
    for (const s of rows) {
      const name = String(s.name || '').replace(/"/g, '""');
      lines.push(`"${name}",${s.score},${s.totalQuestions},${s.percent}%,${s.createdAt || ''}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = slug + '-scores.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function resetScores() {
    const count = (state.detail && state.detail.scores && state.detail.scores.count) || 0;
    if (!confirm(`Permanently delete all ${count} score${count === 1 ? '' : 's'} for this event?`)) return;
    try {
      await api('/events/' + state.eventId + '/scores', { method: 'DELETE' });
      toast('Scores reset');
      await loadScores();
      renderEditor();
    } catch (err) { toast(err.message, 'err'); }
  }

  function renderEditor() {
    const isNew = state.eventId === 'new';
    const detail = state.detail || { event: Object.assign({}, DEFAULT_EVENT), quiz: null, questions: [] };
    const ev = detail.event || {};
    const tabs = isNew ? '' : `
      <div class="tabs">
        <button class="tab ${state.tab === 'event' ? 'active' : ''}" data-tab="event">Event</button>
        <button class="tab ${state.tab === 'quiz' ? 'active' : ''}" data-tab="quiz">Intro &amp; quiz</button>
        <button class="tab ${state.tab === 'questions' ? 'active' : ''}" data-tab="questions">Questions (${(detail.questions || []).length})</button>
        <button class="tab ${state.tab === 'guestbook' ? 'active' : ''}" data-tab="guestbook">Guest book (${ev.guestbookCount || (detail.guestbook && detail.guestbook.count) || 0})</button>
        <button class="tab ${state.tab === 'scores' ? 'active' : ''}" data-tab="scores">Scores (${ev.scoreCount || (detail.scores && detail.scores.count) || 0})</button>
      </div>`;

    let body = '';
    if (isNew || state.tab === 'event') body = eventFields(ev, isNew);
    else if (state.tab === 'quiz') body = quizFields(detail.quiz);
    else if (state.tab === 'scores') body = scoresPanel(detail.scores);
    else if (state.tab === 'guestbook') body = guestbookPanel(detail.guestbook);
    else {
      const qs = detail.questions || [];
      body = `
        <div class="row" style="margin-bottom:14px">
          <button class="btn btn-primary" type="button" id="add-question">Add question</button>
        </div>
        <div class="grid" style="gap:14px">${qs.map((q, i) => questionCard(q, i, qs.length)).join('') || '<p class="empty">No questions yet.</p>'}</div>`;
    }

    $app.innerHTML = `
      <div class="shell">
        ${nav('events')}
        <main class="content">
          <div class="page-head">
            <div>
              <button class="btn btn-ghost btn-sm" data-go="/admin" style="margin-bottom:8px">← All events</button>
              <h1>${isNew ? 'New event' : esc(ev.name || 'Event')}</h1>
              ${isNew ? '<p class="sub">Name the event, write a short description, pick a colour theme, and choose guest features.</p>' : `<p class="sub"><a href="/e/${esc(ev.slug || '')}" target="_blank" rel="noopener">/e/${esc(ev.slug || '')}</a></p>`}
            </div>
            ${!isNew && ev.slug ? `<div class="row" style="gap:8px;flex-wrap:wrap">
              <a class="btn btn-ghost" href="/e/${esc(ev.slug)}" target="_blank" rel="noopener">Open public quiz</a>
              <button class="btn btn-ghost" type="button" id="editor-qr">QR code</button>
              <button class="btn btn-ghost" type="button" id="editor-dup">Duplicate</button>
            </div>` : ''}
          </div>
          ${tabs}
          ${body}
        </main>
      </div>`;
    bindShell();
    bindEditor(isNew);
  }

  function bindEditor(isNew) {
    $app.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        state.tab = btn.getAttribute('data-tab');
        if (state.tab === 'scores' && !(state.detail && state.detail.scores)) await loadScores();
        if (state.tab === 'guestbook' && !(state.detail && state.detail.guestbook)) await loadGuestbook();
        renderEditor();
      });
    });
    const slugSource = $app.querySelector('[data-slug-source]');
    if (slugSource) {
      slugSource.addEventListener('input', () => {
        const slugEl = document.getElementById('ev-slug');
        if (slugEl && !slugEl.dataset.touched) slugEl.value = slugify(slugSource.value);
      });
      const slugEl = document.getElementById('ev-slug');
      if (slugEl) slugEl.addEventListener('input', () => { slugEl.dataset.touched = '1'; });
    }
    $app.querySelectorAll('[data-sync]').forEach((picker) => {
      picker.addEventListener('input', () => {
        const t = document.getElementById(picker.getAttribute('data-sync'));
        if (t) t.value = picker.value;
        markThemeCustomIfTweaked();
      });
    });
    THEME_FIELDS.forEach(([key]) => {
      const text = document.getElementById('theme-' + key);
      if (!text) return;
      text.addEventListener('input', () => {
        const picker = document.getElementById('theme-' + key + '-picker');
        if (picker && /^#[0-9a-fA-F]{6}$/.test(text.value.trim())) picker.value = text.value.trim();
        markThemeCustomIfTweaked();
      });
    });
    $app.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-theme');
        if (id === 'custom') {
          const sel = document.getElementById('ev-preset');
          if (sel) sel.value = 'custom';
          markThemeSelected('custom');
          const adv = document.getElementById('advanced-colors');
          if (adv) adv.open = true;
          return;
        }
        applyColorTheme(id);
      });
    });
    $app.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const em = btn.getAttribute('data-emoji');
        const hidden = document.getElementById('ev-emoji');
        if (hidden) hidden.value = em;
        $app.querySelectorAll('[data-emoji]').forEach((b) => {
          const on = b.getAttribute('data-emoji') === em;
          b.classList.toggle('selected', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
    });
    bindIntroPreview();
    const saveEv = document.getElementById('save-event');
    if (saveEv) saveEv.addEventListener('click', () => saveEvent(isNew));
    const occasion = document.getElementById('ev-occasion');
    if (occasion) occasion.addEventListener('change', syncOccasionUi);

    const saveQuiz = document.getElementById('save-quiz');
    if (saveQuiz) saveQuiz.addEventListener('click', saveQuizCopy);
    const addTier = document.getElementById('add-tier');
    if (addTier) addTier.addEventListener('click', () => {
      document.getElementById('tier-list').insertAdjacentHTML('beforeend', tierRow({ minPercent: 0, maxPercent: 100, title: '', message: '' }, Date.now()));
      bindTiers();
    });
    const defTiers = document.getElementById('default-tiers');
    if (defTiers) defTiers.addEventListener('click', () => {
      document.getElementById('tier-list').innerHTML = DEFAULT_TIERS.map((t, i) => tierRow(t, i)).join('');
      bindTiers();
    });
    bindTiers();

    document.getElementById('editor-qr')?.addEventListener('click', () => {
      const ev = state.detail && state.detail.event;
      if (!ev || !ev.slug) return;
      showQrModal(location.origin + '/e/' + ev.slug, ev.name || 'Event');
    });
    document.getElementById('editor-dup')?.addEventListener('click', () => {
      if (state.eventId) duplicateEvent(state.eventId);
    });
    document.getElementById('scores-csv')?.addEventListener('click', downloadScoresCsv);
    document.getElementById('scores-reset')?.addEventListener('click', resetScores);
    $app.querySelectorAll('[data-del-gb]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this guest book message?')) return;
        try {
          await api('/events/' + state.eventId + '/guestbook/' + btn.getAttribute('data-del-gb'), { method: 'DELETE' });
          toast('Message deleted');
          await loadGuestbook();
          renderEditor();
        } catch (err) { toast(err.message, 'err'); }
      });
    });

    $app.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => openPicker(btn.getAttribute('data-pick'), (url) => {
        const id = btn.getAttribute('data-target');
        if (id) {
          const el = document.getElementById(id);
          if (el) el.value = url;
          if (id.indexOf('photo-src-') === 0) updatePreviewPhoto(Number(id.slice('photo-src-'.length)));
          return;
        }
        const card = btn.closest('.q-card');
        const input = card && card.querySelector('.' + btn.getAttribute('data-target-class'));
        if (input) input.value = url;
      }));
    });

    const addQ = document.getElementById('add-question');
    if (addQ) addQ.addEventListener('click', addQuestion);

    $app.querySelectorAll('.q-card').forEach((card) => bindQuestionCard(card));
  }

  function bindIntroPreview() {
    const pairs = [
      ['ecard-greeting', 'preview-greeting', 'Happy Birthday!'],
      ['ecard-sub', 'preview-sub', 'A short tagline'],
      ['ecard-message', 'preview-msg', 'Your welcome note appears here.'],
      ['ecard-btn', 'preview-btn', 'Start the Quiz →'],
    ];
    pairs.forEach(([src, dest, fallback]) => {
      const el = document.getElementById(src);
      const out = document.getElementById(dest);
      if (!el || !out) return;
      el.addEventListener('input', () => { out.textContent = el.value.trim() || fallback; });
    });
    for (let i = 0; i < 6; i++) {
      const src = document.getElementById('photo-src-' + i);
      const cap = document.getElementById('photo-cap-' + i);
      if (src) src.addEventListener('input', () => updatePreviewPhoto(i));
      if (cap) cap.addEventListener('input', () => updatePreviewPhoto(i));
    }
  }

  function updatePreviewPhoto(i) {
    const fig = document.querySelector('[data-preview-photo="' + i + '"]');
    if (!fig) return;
    const src = val('photo-src-' + i);
    const cap = val('photo-cap-' + i);
    const box = fig.querySelector('.intro-polaroid-photo');
    const capEl = fig.querySelector('figcaption');
    if (box) box.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '';
    if (capEl) capEl.textContent = cap || ('Photo ' + (i + 1));
  }

  function bindTiers() {
    document.querySelectorAll('[data-remove-tier]').forEach((btn) => {
      btn.onclick = () => {
        const list = document.getElementById('tier-list');
        if (list.children.length <= 1) return;
        btn.closest('[data-tier]').remove();
      };
    });
  }

  function readTiers() {
    return Array.from(document.querySelectorAll('#tier-list [data-tier]')).map((el) => ({
      minPercent: Number(el.querySelector('.tier-min').value),
      maxPercent: Number(el.querySelector('.tier-max').value),
      title: el.querySelector('.tier-title').value,
      message: el.querySelector('.tier-message').value,
    }));
  }

  function markThemeSelected(id) {
    $app.querySelectorAll('[data-theme]').forEach((btn) => {
      const on = btn.getAttribute('data-theme') === id;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function applyColorTheme(id) {
    const preset = COLOR_THEMES[id];
    if (!preset) return false;
    THEME_FIELDS.forEach(([key]) => {
      const hex = preset.theme[key];
      const text = document.getElementById('theme-' + key);
      const picker = document.getElementById('theme-' + key + '-picker');
      if (text && hex) text.value = hex;
      if (picker && hex) picker.value = hex;
    });
    const sel = document.getElementById('ev-preset');
    if (sel) sel.value = id;
    markThemeSelected(id);
    const customCard = $app.querySelector('[data-theme="custom"] .theme-swatch');
    if (customCard) {
      const spans = customCard.querySelectorAll('span');
      const keys = ['primaryRed', 'accentOrange', 'highlightPink', 'bgEarth'];
      keys.forEach((key, i) => { if (spans[i] && preset.theme[key]) spans[i].style.background = preset.theme[key]; });
    }
    return true;
  }

  function markThemeCustomIfTweaked() {
    const current = readThemeFromForm();
    const presetId = val('ev-preset');
    const preset = COLOR_THEMES[presetId];
    if (preset && themesEqual(current, preset.theme)) return;
    const sel = document.getElementById('ev-preset');
    if (sel) sel.value = 'custom';
    markThemeSelected('custom');
    const customCard = $app.querySelector('[data-theme="custom"] .theme-swatch');
    if (customCard) {
      const spans = customCard.querySelectorAll('span');
      ['primaryRed', 'accentOrange', 'highlightPink', 'bgEarth'].forEach((key, i) => {
        if (spans[i] && current[key]) spans[i].style.background = current[key];
      });
    }
  }

  function syncOccasionUi() {
    const v = val('ev-occasion');
    const wrap = document.getElementById('ev-occasion-custom-wrap');
    if (wrap) wrap.hidden = v !== 'Other';
  }

  async function saveEvent(isNew) {
    const occasionSel = val('ev-occasion');
    const payload = {
      name: val('ev-name'),
      slug: val('ev-slug'),
      occasionType: occasionSel === 'Other' ? (val('ev-occasion-custom').trim() || 'Other') : occasionSel,
      eventDate: val('ev-date') || null,
      status: val('ev-status'),
      headerEmoji: val('ev-emoji'),
      description: val('ev-description'),
      enableQuiz: val('ev-quiz'),
      enableLeaderboard: val('ev-hof'),
      enableGallery: val('ev-gallery'),
      enableMusic: val('ev-music'),
      enableGuestbook: val('ev-guestbook'),
      themePreset: val('ev-preset') || 'custom',
      theme: readThemeFromForm(),
    };
    try {
      if (isNew) {
        const created = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
        toast('Event created. Add photos and questions on the next tabs.');
        state.detail = created;
        state.tab = 'quiz';
        go('/admin/events/' + created.event.id);
      } else {
        const updated = await api('/events/' + state.eventId, { method: 'PUT', body: JSON.stringify(payload) });
        state.detail.event = Object.assign(state.detail.event, updated.event);
        toast('Event saved');
        renderEditor();
      }
    } catch (err) { toast(err.message, 'err'); }
  }

  async function saveQuizCopy() {
    const photos = [];
    for (let i = 0; i < 6; i++) {
      const src = val('photo-src-' + i);
      const caption = val('photo-cap-' + i);
      if (src || caption) photos.push({ src, caption });
    }
    const payload = {
      title: val('quiz-title'),
      subtitle: val('quiz-subtitle'),
      honoree: val('quiz-honoree'),
      welcomeMessage: val('quiz-welcome'),
      heroImage: val('quiz-hero'),
      audio: {
        backgroundMusic: val('audio-bg'),
        correctSound: val('audio-ok'),
        wrongSound: val('audio-bad'),
        playlist: Array.from(document.querySelectorAll('.playlist-track:checked')).map((el) => el.value),
      },
      ecard: {
        greeting: val('ecard-greeting'),
        subGreeting: val('ecard-sub'),
        message: val('ecard-message'),
        buttonText: val('ecard-btn'),
        photos,
      },
      scoreTiers: readTiers(),
    };
    try {
      const data = await api('/events/' + state.eventId + '/quiz', { method: 'PUT', body: JSON.stringify(payload) });
      state.detail.quiz = data.quiz;
      toast('Quiz saved');
    } catch (err) { toast(err.message, 'err'); }
  }

  function readQuestionCard(card) {
    const opts = Array.from(card.querySelectorAll('.q-opt')).map((el) => el.value.trim());
    const filled = [];
    const radios = Array.from(card.querySelectorAll('input[type="radio"]'));
    let correctIndex = 0;
    opts.forEach((opt, i) => {
      if (!opt) return;
      if (radios[i] && radios[i].checked) correctIndex = filled.length;
      filled.push(opt);
    });
    return {
      question: card.querySelector('.q-text').value,
      submittedBy: card.querySelector('.q-by').value,
      type: card.querySelector('.q-type').value,
      image: card.querySelector('.q-image').value,
      funFact: card.querySelector('.q-fact').value,
      audioClip: card.querySelector('.q-audio').value,
      options: filled,
      correctIndex,
    };
  }

  function bindQuestionCard(card) {
    card.querySelector('[data-save-q]').addEventListener('click', async () => {
      try {
        const data = await api('/questions/' + card.getAttribute('data-qid'), {
          method: 'PUT',
          body: JSON.stringify(readQuestionCard(card)),
        });
        const idx = state.detail.questions.findIndex((q) => q.id === data.question.id);
        if (idx >= 0) state.detail.questions[idx] = data.question;
        toast('Question saved');
      } catch (err) { toast(err.message, 'err'); }
    });
    card.querySelector('[data-del-q]').addEventListener('click', async () => {
      if (!confirm('Delete this question?')) return;
      try {
        await api('/questions/' + card.getAttribute('data-qid'), { method: 'DELETE' });
        state.detail.questions = state.detail.questions.filter((q) => q.id !== card.getAttribute('data-qid'));
        toast('Question deleted');
        renderEditor();
      } catch (err) { toast(err.message, 'err'); }
    });
    card.querySelector('[data-add-opt]').addEventListener('click', () => {
      const box = card.querySelector('.options-edit');
      if (box.querySelectorAll('.opt-row').length >= 8) return;
      const id = card.getAttribute('data-qid');
      box.insertAdjacentHTML('beforeend', `
        <div class="opt-row">
          <input type="radio" name="correct-${esc(id)}" />
          <input class="q-opt" value="" placeholder="Option" />
          <button class="btn btn-ghost btn-sm" type="button" data-remove-opt>Remove</button>
        </div>`);
      bindOptRemove(card);
    });
    bindOptRemove(card);
    card.querySelector('[data-move="up"]').addEventListener('click', () => moveQuestion(card.getAttribute('data-qid'), -1));
    card.querySelector('[data-move="down"]').addEventListener('click', () => moveQuestion(card.getAttribute('data-qid'), 1));
  }

  function bindOptRemove(card) {
    card.querySelectorAll('[data-remove-opt]').forEach((btn) => {
      btn.onclick = () => {
        const rows = card.querySelectorAll('.opt-row');
        if (rows.length <= 2) return;
        btn.closest('.opt-row').remove();
      };
    });
  }

  async function addQuestion() {
    try {
      const data = await api('/events/' + state.eventId + '/questions', {
        method: 'POST',
        body: JSON.stringify({
          question: 'New question',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctIndex: 0,
          type: 'text',
        }),
      });
      state.detail.questions.push(data.question);
      toast('Question added');
      renderEditor();
    } catch (err) { toast(err.message, 'err'); }
  }

  async function moveQuestion(id, dir) {
    const ids = state.detail.questions.map((q) => q.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      const data = await api('/events/' + state.eventId + '/questions/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      });
      state.detail.questions = data.questions;
      renderEditor();
    } catch (err) { toast(err.message, 'err'); }
  }

  // ── Media library ──────────────────────────────────────────────────
  function renderMedia() {
    $app.innerHTML = `
      <div class="shell">
        ${nav('media')}
        <main class="content">
          <div class="page-head">
            <div>
              <h1>Media library</h1>
              <p class="sub">Files land in the Docker volumes for <code>/app/public/images</code> and <code>/app/public/music</code>.</p>
            </div>
          </div>
          <div class="grid grid-2">
            <section>
              <h2 class="section-title">Photos &amp; videos</h2>
              ${dropzone('image')}
              <div class="media-grid">${mediaCards(state.media.images, 'image')}</div>
            </section>
            <section>
              <h2 class="section-title">Music (MP3)</h2>
              ${dropzone('music')}
              <div class="media-grid">${mediaCards(state.media.music, 'music')}</div>
            </section>
          </div>
        </main>
      </div>`;
    bindShell();
    bindDropzones();
    bindMediaDeletes();
  }

  function dropzone(kind) {
    const accept = kind === 'music' ? '.mp3,audio/mpeg' : 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm';
    return `
      <div class="drop" data-kind="${kind}">
        Drop ${kind === 'music' ? 'MP3s' : 'photos or videos'} here or
        <label class="btn btn-ghost btn-sm" style="display:inline-flex;margin-left:6px">
          Browse
          <input type="file" accept="${accept}" hidden data-upload="${kind}" />
        </label>
      </div>`;
  }

  function mediaCards(items, kind) {
    if (!items || !items.length) return '<p class="empty">Nothing uploaded yet.</p>';
    return items.map((f) => `
      <article class="media-item">
        ${kind === 'image'
          ? (/\.(mp4|webm)$/i.test(f.name || f.url || '')
            ? `<video src="${esc(f.url)}" muted></video>`
            : `<img src="${esc(f.url)}" alt="" />`)
          : `<div style="padding:28px 10px;text-align:center;background:#0f172a;color:#fff;font-weight:700">MP3</div>`}
        <div class="body">
          <div class="name">${esc(f.name)}</div>
          <p class="meta">${esc(f.url)}</p>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" data-copy="${esc(kind === 'music' ? f.name : f.url)}">Copy path</button>
            <button class="btn btn-ghost btn-sm" data-del-media="${esc(kind)}" data-name="${esc(f.name)}">Delete</button>
          </div>
        </div>
      </article>`).join('');
  }

  function bindDropzones() {
    $app.querySelectorAll('.drop').forEach((zone) => {
      const kind = zone.getAttribute('data-kind');
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
        e.preventDefault(); zone.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
        e.preventDefault(); zone.classList.remove('over');
      }));
      zone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) uploadFile(kind, file);
      });
    });
    $app.querySelectorAll('[data-upload]').forEach((input) => {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (file) uploadFile(input.getAttribute('data-upload'), file);
        input.value = '';
      });
    });
  }

  function bindMediaDeletes() {
    $app.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(btn.getAttribute('data-copy')); toast('Path copied'); }
        catch { toast('Could not copy', 'err'); }
      });
    });
    $app.querySelectorAll('[data-del-media]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this file from the volume?')) return;
        const kind = btn.getAttribute('data-del-media');
        const name = btn.getAttribute('data-name');
        try {
          await api('/media/' + kind + '/' + encodeURIComponent(name), { method: 'DELETE' });
          toast('Deleted');
          await loadMedia();
          renderMedia();
        } catch (err) { toast(err.message, 'err'); }
      });
    });
  }

  async function uploadFile(kind, file) {
    const body = new FormData();
    body.append('file', file);
    try {
      await api('/media?kind=' + encodeURIComponent(kind), { method: 'POST', body });
      toast('Uploaded ' + file.name);
      await loadMedia();
      if (state.view === 'media') renderMedia();
    } catch (err) { toast(err.message, 'err'); }
  }

  function openPicker(kind, onPick) {
    const items = kind === 'music' ? state.media.music : state.media.images;
    $modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <div class="page-head">
            <h2>Choose ${kind === 'music' ? 'MP3' : 'image'}</h2>
            <button class="btn btn-ghost btn-sm" type="button" id="close-modal">Close</button>
          </div>
          ${dropzone(kind)}
          <div class="grid" style="gap:8px">
            ${(items || []).map((f) => `
              <button class="picker-item" type="button" data-url="${esc(kind === 'music' ? f.name : f.url)}">
                ${kind === 'image' ? `<img src="${esc(f.url)}" alt="" />` : ''}
                <span>${esc(f.name)}</span>
              </button>`).join('') || '<p class="empty">Upload a file first.</p>'}
          </div>
        </div>
      </div>`;
    document.getElementById('close-modal').onclick = () => { $modal.innerHTML = ''; };
    $modal.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) $modal.innerHTML = '';
    });
    $modal.querySelectorAll('[data-url]').forEach((btn) => {
      btn.addEventListener('click', () => { onPick(btn.getAttribute('data-url')); $modal.innerHTML = ''; });
    });
    const zone = $modal.querySelector('.drop');
    const k = zone.getAttribute('data-kind');
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault(); zone.classList.remove('over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      await uploadFile(k, file);
      openPicker(kind, onPick);
    });
    $modal.querySelector('[data-upload]').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      await uploadFile(k, file);
      openPicker(kind, onPick);
    });
  }

  function bindShell() {
    $app.querySelectorAll('[data-go]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        go(el.getAttribute('data-go'));
      });
    });
    const logout = document.getElementById('logout-btn');
    if (logout) logout.addEventListener('click', async () => {
      try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
      state.authed = false;
      render();
    });
  }

  function render() {
    $modal.innerHTML = '';
    if (!state.authed) return renderLogin();
    if (state.view === 'media') return renderMedia();
    if (state.view === 'editor') return renderEditor();
    renderEvents();
  }

  async function loadMedia() {
    try { state.media = await api('/media'); }
    catch { state.media = { images: [], music: [] }; }
  }

  async function loadView() {
    if (!state.authed) return;
    try {
      if (state.view === 'events') {
        state.events = await api('/events');
        renderEvents();
      } else if (state.view === 'media') {
        await loadMedia();
        renderMedia();
      } else if (state.view === 'editor' && state.eventId !== 'new') {
        $app.innerHTML = `<div class="shell">${nav('events')}<main class="content"><p class="meta">Loading event…</p></main></div>`;
        bindShell();
        await loadMedia();
        state.detail = await api('/events/' + state.eventId);
        renderEditor();
      } else if (state.view === 'editor') {
        await loadMedia();
        state.detail = { event: Object.assign({}, DEFAULT_EVENT), quiz: null, questions: [] };
        renderEditor();
      }
    } catch (err) {
      toast(err.message, 'err');
      if (err.status === 404) go('/admin');
    }
  }

  async function boot() {
    parseRoute();
    try {
      await api('/session');
      state.authed = true;
    } catch {
      state.authed = false;
    }
    render();
    if (state.authed) loadView();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
