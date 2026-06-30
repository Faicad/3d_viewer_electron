#!/usr/bin/env node

/**
 * edit-marks.mjs — Visual marks.json editor with image overlay
 *
 * Usage:
 *   node movies/edit-marks.mjs movies/e1/ai_gen
 *   node movies/edit-marks.mjs movies/e1/ai_gen --script m5
 */

import { createServer } from 'http';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { URL } from 'url';

const PORT = 5179;
const dir = process.argv[2] || '.';
const scriptFilter = process.argv.includes('--script')
  ? process.argv[process.argv.indexOf('--script') + 1]
  : null;

const marksRegex = /^(.+)_(\d{4})_(h|v)_marks\.json$/;
const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function getImageFile(dir, prefix, orient) {
  const base = join(dir, `${prefix}_${orient}_full`);
  for (const ext of imageExts) {
    const p = base + ext;
    if (existsSync(p)) return `${prefix}_${orient}_full${ext}`;
  }
  return null;
}

function flatScenes(dir) {
  let items = readdirSync(dir)
    .filter(f => marksRegex.test(f))
    .map(f => {
      const m = f.match(marksRegex);
      const scriptName = m[1];
      const sceneIndex = m[2];
      const orient = m[3];
      const prefix = `${scriptName}_${sceneIndex}`;
      const imageFile = getImageFile(dir, prefix, orient);
      return {
        id: `${prefix}_${orient}`,
        prefix,
        orient,
        scriptName,
        sceneIndex,
        marksFile: f,
        hasImage: !!imageFile,
        imageFile,
      };
    });

  if (scriptFilter) items = items.filter(s => s.scriptName === scriptFilter);

  items.sort((a, b) => {
    if (a.scriptName !== b.scriptName) return a.scriptName.localeCompare(b.scriptName);
    if (a.sceneIndex !== b.sceneIndex) return a.sceneIndex.localeCompare(b.sceneIndex);
    return a.orient.localeCompare(b.orient); // h before v
  });

  return items;
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.json': 'application/json',
  '.html': 'text/html', '.svg': 'image/svg+xml',
};

const items = flatScenes(dir);

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    req.on('error', () => resolve(null));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  try {
    if (path === '/api/scenes' && req.method === 'GET') {
      json(res, items);
      return;
    }

    const itemMatch = path.match(/^\/api\/scene\/(.+?)$/);
    if (itemMatch && req.method === 'GET') {
      const id = itemMatch[1];
      const item = items.find(s => s.id === id);
      if (!item) { json(res, { error: 'not found' }, 404); return; }

      const marks = JSON.parse(readFileSync(join(dir, item.marksFile), 'utf-8'));
      let imageBase64 = null;
      if (item.imageFile) {
        const imgData = readFileSync(join(dir, item.imageFile));
        const ext = extname(item.imageFile).toLowerCase();
        const mimeType = MIME[ext] || 'image/png';
        imageBase64 = `data:${mimeType};base64,${imgData.toString('base64')}`;
      }
      json(res, { ...item, marks, imageBase64 });
      return;
    }

    if (itemMatch && req.method === 'PUT') {
      const id = itemMatch[1];
      const item = items.find(s => s.id === id);
      if (!item) { json(res, { error: 'not found' }, 404); return; }

      const body = await getBody(req);
      writeFileSync(join(dir, item.marksFile), JSON.stringify(body.marks, null, 2) + '\n', 'utf-8');
      json(res, { ok: true });
      return;
    }

    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getEditorHtml());
      return;
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    console.error(e);
    json(res, { error: e.message }, 500);
  }
}).listen(PORT, () => {
  console.log(`\n  Mark Editor started — ${items.length} files`);
  console.log(`  Directory: ${dir}`);
  console.log(`  Open: http://localhost:${PORT}\n`);
});

const __editMarks_html = readFileSync(new URL('edit-marks.html', import.meta.url), 'utf-8');
function getEditorHtml() { return __editMarks_html; }
