'use strict';

/**
 * Per-event media on the Docker volumes.
 * New uploads live in public/images/<eventId>/ and public/music/<eventId>/.
 * Older files that sit directly in those folders keep working.
 */

const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const MUSIC_DIR = path.join(PUBLIC_DIR, 'music');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']);
const IMAGE_RE = /\.(jpe?g|png|gif|webp|mp4|webm)$/i;

fs.mkdirSync(IMAGES_DIR, { recursive: true });
fs.mkdirSync(MUSIC_DIR, { recursive: true });

function safeEventId(id) {
  const s = String(id || '');
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(s)) return null;
  return s;
}

function safeFileName(filename) {
  const base = path.basename(String(filename || '').replace(/\\/g, '/'));
  if (!base || base === '.' || base === '..' || base.includes('\0')) return null;
  return base;
}

function safeMp3Name(value) {
  const base = safeFileName(value);
  if (!base || !/\.mp3$/i.test(base)) return null;
  return base;
}

function eventMediaDir(kind, eventId) {
  const id = safeEventId(eventId);
  if (!id) return null;
  return path.join(kind === 'music' ? MUSIC_DIR : IMAGES_DIR, id);
}

function uniqueFilename(dir, original) {
  const ext = path.extname(original).toLowerCase();
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
      url: `${urlPrefix}/${encodeURIComponent(name)}`,
      size: st.size,
      mtime: st.mtime.toISOString(),
    });
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return out;
}

function fileExists(full) {
  try { return fs.statSync(full).isFile(); }
  catch { return false; }
}

function resolveMp3Url(eventId, value) {
  const name = safeMp3Name(value);
  if (!name) return null;
  const id = safeEventId(eventId);
  if (id && fileExists(path.join(MUSIC_DIR, id, name))) {
    return `/music/${id}/${encodeURIComponent(name)}`;
  }
  if (fileExists(path.join(MUSIC_DIR, name))) {
    return `/music/${encodeURIComponent(name)}`;
  }
  return null;
}

function presentClip(eventId, value) {
  if (value == null || value === '') return value ?? null;
  return resolveMp3Url(eventId, value) || value;
}

function legacyImageName(url) {
  const m = String(url || '').match(/^\/images\/([^/]+)$/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); }
  catch { return m[1]; }
}

function copyEventMedia(fromId, toId) {
  for (const kind of ['image', 'music']) {
    const src = eventMediaDir(kind, fromId);
    const dest = eventMediaDir(kind, toId);
    if (!src || !dest || !fs.existsSync(src)) continue;
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      if (!fileExists(from)) continue;
      fs.copyFileSync(from, path.join(dest, name));
    }
  }
}

function rewriteOwnedUrl(url, fromId, toId) {
  const s = String(url || '');
  if (!s || !safeEventId(fromId) || !safeEventId(toId)) return s;
  return s
    .split(`/images/${fromId}/`).join(`/images/${toId}/`)
    .split(`/music/${fromId}/`).join(`/music/${toId}/`);
}

function detachLegacyImage(url, toId) {
  const name = legacyImageName(url);
  const id = safeEventId(toId);
  if (!name || !id || !safeFileName(name)) return String(url || '');
  const src = path.join(IMAGES_DIR, name);
  if (!fileExists(src)) return String(url || '');
  const destDir = path.join(IMAGES_DIR, id);
  fs.mkdirSync(destDir, { recursive: true });
  const destName = uniqueFilename(destDir, name);
  fs.copyFileSync(src, path.join(destDir, destName));
  return `/images/${id}/${encodeURIComponent(destName)}`;
}

function retargetImageUrl(url, fromId, toId) {
  if (url == null || String(url).trim() === '') return url || null;
  const owned = rewriteOwnedUrl(url, fromId, toId);
  if (owned !== String(url)) return owned;
  return detachLegacyImage(url, toId);
}

function copyLegacyMp3(name, toId) {
  const base = safeMp3Name(name);
  const id = safeEventId(toId);
  if (!base || !id) return;
  const dest = path.join(MUSIC_DIR, id, base);
  if (fileExists(dest)) return;
  const src = path.join(MUSIC_DIR, base);
  if (!fileExists(src)) return;
  fs.mkdirSync(path.join(MUSIC_DIR, id), { recursive: true });
  fs.copyFileSync(src, dest);
}

function removeEventMedia(eventId) {
  const id = safeEventId(eventId);
  if (!id) return;
  fs.rmSync(path.join(IMAGES_DIR, id), { recursive: true, force: true });
  fs.rmSync(path.join(MUSIC_DIR, id), { recursive: true, force: true });
}

async function readLimited(req, limit, tooLargeMessage) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      const err = new Error(tooLargeMessage || 'File is too large (max 25 MB).');
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
  const fields = {};
  let file = null;
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
      const body = part.subarray(sep + 4);
      const fileMatch = header.match(/filename\*=(?:UTF-8''|)([^;\r\n]+)/i)
        || header.match(/filename="((?:\\.|[^"\\])*)"/i)
        || header.match(/filename=([^;\r\n]+)/i);
      const nameMatch = header.match(/name="([^"]+)"/i) || header.match(/name=([^;\r\n]+)/i);
      const fieldName = nameMatch ? nameMatch[1].trim() : '';
      let filename = fileMatch ? (fileMatch[1] || '').trim().replace(/^"|"$/g, '').replace(/\\"/g, '"') : '';
      try { filename = decodeURIComponent(filename); } catch { /* keep raw */ }
      if (filename) {
        if (!file) file = { filename: path.basename(filename), buffer: body };
      } else if (fieldName) {
        fields[fieldName] = body.toString('utf8');
      }
    }
    offset = next;
  }
  if (!file || !file.buffer || !file.buffer.length) {
    const err = new Error('Choose a file to upload.');
    err.status = 400;
    throw err;
  }
  return { filename: file.filename, buffer: file.buffer, fields };
}

module.exports = {
  IMAGES_DIR,
  MUSIC_DIR,
  IMAGE_EXTS,
  IMAGE_RE,
  safeEventId,
  safeFileName,
  safeMp3Name,
  eventMediaDir,
  uniqueFilename,
  listMedia,
  resolveMp3Url,
  presentClip,
  legacyImageName,
  copyEventMedia,
  retargetImageUrl,
  copyLegacyMp3,
  removeEventMedia,
  readLimited,
  parseMultipartFile,
};
