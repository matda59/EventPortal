/* =====================================================================
   Event Portal — Admin dashboard
   Cookie-gated CRUD for events, quizzes, questions, and media volumes.
   ===================================================================== */

(function () {
  'use strict';

  const DEFAULT_THEME = {
    primaryRed:    '#B83B26',
    accentOrange:  '#D96B27',
    highlightPink: '#D86B81',
    bgEarth:       '#FBF6EF',
    surfaceCard:   '#FFFFFF',
    textDark:      '#2B2121',
  };

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
          · ${ev.enableLeaderboard ? 'Leaderboard on' : 'Leaderboard off'}
          · ${ev.questionCount || 0} question${ev.questionCount === 1 ? '' : 's'}
          · ${ev.scoreCount || 0} score${ev.scoreCount === 1 ? '' : 's'}
        </p>
        <div class="card-actions">
          <button class="btn btn-primary btn-sm" data-go="/admin/events/${esc(ev.id)}">Edit</button>
          <a class="btn btn-ghost btn-sm" href="/e/${esc(ev.slug)}" target="_blank" rel="noopener">Open quiz</a>
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

  // ── Editor ─────────────────────────────────────────────────────────
  function eventFields(ev, isNew) {
    const theme = Object.assign({}, DEFAULT_THEME, ev.theme || {});
    const colors = THEME_FIELDS.map(([key, label]) => `
      <div class="field">
        <label>${esc(label)}</label>
        <div class="color-row">
          <input type="color" id="theme-${key}-picker" value="${esc(theme[key] || '#000000')}" data-sync="theme-${key}" />
          <input type="text" id="theme-${key}" value="${esc(theme[key] || '')}" />
        </div>
      </div>`).join('');

    return `
      <div class="form-grid">
        <div class="field span-2">
          <label for="ev-name">Name</label>
          <input id="ev-name" value="${esc(ev.name || '')}" ${isNew ? 'data-slug-source' : ''} required />
        </div>
        <div class="field">
          <label for="ev-slug">Slug (public URL)</label>
          <input id="ev-slug" value="${esc(ev.slug || '')}" required />
        </div>
        <div class="field">
          <label for="ev-occasion">Occasion</label>
          <input id="ev-occasion" value="${esc(ev.occasionType || 'Birthday')}" list="occasion-list" />
          <datalist id="occasion-list">
            <option value="Birthday"><option value="Wedding"><option value="Retirement">
            <option value="Kids party"><option value="Anniversary">
          </datalist>
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
        <div class="field">
          <label for="ev-emoji">Header emoji</label>
          <input id="ev-emoji" value="${esc(ev.headerEmoji || '🎉')}" maxlength="8" />
        </div>
        <p class="hint span-2">draft is hidden from guests. active is live at /e/slug. ended shows “this event has ended”.</p>
        <label class="check"><input type="checkbox" id="ev-quiz" ${ev.enableQuiz !== false ? 'checked' : ''} /> Enable quiz</label>
        <label class="check"><input type="checkbox" id="ev-hof" ${ev.enableLeaderboard !== false ? 'checked' : ''} /> Enable leaderboard</label>
        <p class="hint span-2">Quiz off: e-card and welcome only — no name form or questions. Leaderboard off: guests still see their score, but Hall of Fame is hidden and nothing is posted.</p>
        <div class="span-2"><p class="hint">Theme colours are applied to the public quiz SPA.</p></div>
        ${colors}
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
      <p class="hint">Tick the tracks that should appear in this event’s public player. Background music is included automatically.</p>
      ${playlistPicker(audio.playlist)}

      <h2 class="section-title" style="margin-top:28px">E-card</h2>
      <div class="form-grid">
        <div class="field">
          <label for="ecard-greeting">Greeting</label>
          <input id="ecard-greeting" value="${esc(ecard.greeting || '')}" />
        </div>
        <div class="field">
          <label for="ecard-sub">Sub-greeting</label>
          <input id="ecard-sub" value="${esc(ecard.subGreeting || '')}" />
        </div>
        <div class="field span-2">
          <label for="ecard-message">Message</label>
          <textarea id="ecard-message">${esc(ecard.message || '')}</textarea>
        </div>
        <div class="field span-2">
          <label for="ecard-btn">Button text</label>
          <input id="ecard-btn" value="${esc(ecard.buttonText || '')}" />
        </div>
      </div>
      <p class="hint" style="margin-top:12px">Up to six polaroid photos on the intro screen.</p>
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

  function renderEditor() {
    const isNew = state.eventId === 'new';
    const detail = state.detail || { event: { status: 'draft', enableQuiz: true, enableLeaderboard: true, theme: DEFAULT_THEME }, quiz: null, questions: [] };
    const ev = detail.event || {};
    const tabs = isNew ? '' : `
      <div class="tabs">
        <button class="tab ${state.tab === 'event' ? 'active' : ''}" data-tab="event">Event</button>
        <button class="tab ${state.tab === 'quiz' ? 'active' : ''}" data-tab="quiz">Quiz &amp; e-card</button>
        <button class="tab ${state.tab === 'questions' ? 'active' : ''}" data-tab="questions">Questions (${(detail.questions || []).length})</button>
      </div>`;

    let body = '';
    if (isNew || state.tab === 'event') body = eventFields(ev, isNew);
    else if (state.tab === 'quiz') body = quizFields(detail.quiz);
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
              ${isNew ? '<p class="sub">Save the event first, then add quiz copy and questions.</p>' : `<p class="sub"><a href="/e/${esc(ev.slug || '')}" target="_blank" rel="noopener">/e/${esc(ev.slug || '')}</a></p>`}
            </div>
            ${!isNew && ev.slug ? `<a class="btn btn-ghost" href="/e/${esc(ev.slug)}" target="_blank" rel="noopener">Open public quiz</a>` : ''}
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
      btn.addEventListener('click', () => { state.tab = btn.getAttribute('data-tab'); renderEditor(); });
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
      });
    });
    const saveEv = document.getElementById('save-event');
    if (saveEv) saveEv.addEventListener('click', () => saveEvent(isNew));

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

    $app.querySelectorAll('[data-pick]').forEach((btn) => {
      btn.addEventListener('click', () => openPicker(btn.getAttribute('data-pick'), (url) => {
        const id = btn.getAttribute('data-target');
        if (id) {
          const el = document.getElementById(id);
          if (el) el.value = url;
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

  async function saveEvent(isNew) {
    const payload = {
      name: val('ev-name'),
      slug: val('ev-slug'),
      occasionType: val('ev-occasion'),
      eventDate: val('ev-date') || null,
      status: val('ev-status'),
      headerEmoji: val('ev-emoji'),
      enableQuiz: val('ev-quiz'),
      enableLeaderboard: val('ev-hof'),
      theme: readThemeFromForm(),
    };
    try {
      if (isNew) {
        const created = await api('/events', { method: 'POST', body: JSON.stringify(payload) });
        toast('Event created');
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
              <h2 class="section-title">Images</h2>
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
    const accept = kind === 'music' ? '.mp3,audio/mpeg' : 'image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp';
    return `
      <div class="drop" data-kind="${kind}">
        Drop ${kind === 'music' ? 'MP3s' : 'images'} here or
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
        ${kind === 'image' ? `<img src="${esc(f.url)}" alt="" />` : `<div style="padding:28px 10px;text-align:center;background:#0f172a;color:#fff;font-weight:700">MP3</div>`}
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
        state.detail = { event: { status: 'draft', enableQuiz: true, enableLeaderboard: true, theme: DEFAULT_THEME }, quiz: null, questions: [] };
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
