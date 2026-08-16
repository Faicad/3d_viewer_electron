import fs from 'node:fs';
import { readFile } from 'node:fs/promises';

const f = process.argv[2] || 'article.md';
const raw = (await readFile(f, 'utf8')).replace(/\r\n/g, '\n');
const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
const fm = {};
if (m) {
  for (const l of m[1].split('\n')) {
    const mm = l.match(/^([\w-]+):\s*(.*)$/);
    if (mm) {
      let v = mm[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      fm[mm[1]] = v;
    }
  }
}
const body = m ? raw.slice(m[0].length) : raw;

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(t) {
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code style="background:#f6f8fa;padding:2px 5px;border-radius:4px;font-size:90%;">${esc(c)}</code>`);
  t = esc(t);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, x, u) => `<a href="${u}" style="color:#576b95;">${x}</a>`);
  return t;
}
function isTableSep(l) { return /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes('-'); }

function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="background:#f6f8fa;padding:14px 16px;border-radius:8px;overflow:auto;font-size:13px;line-height:1.5;"><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      const sz = [0, 22, 20, 18, 16, 15, 14][lv];
      out.push(`<h${lv} style="font-size:${sz}px;font-weight:700;margin:24px 0 12px;line-height:1.4;">${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const split = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const headers = split(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(split(lines[i])); i++; }
      let t = '<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;line-height:1.6;">';
      t += '<thead><tr>';
      for (const c of headers) t += `<th style="border:1px solid #dfe1e6;padding:8px 10px;background:#f6f8fa;font-weight:600;text-align:left;">${inline(c)}</th>`;
      t += '</tr></thead><tbody>';
      for (const r of rows) { t += '<tr>'; for (const c of r) t += `<td style="border:1px solid #dfe1e6;padding:8px 10px;">${inline(c)}</td>`; t += '</tr>'; }
      t += '</tbody></table>';
      out.push(t);
      continue;
    }
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote style="margin:16px 0;padding:8px 16px;border-left:4px solid #d0d7de;color:#57606a;background:#f6f8fa;">${inline(buf.join('<br>'))}</blockquote>`);
      continue;
    }
    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/);
    if (img) {
      const base = img[2].split('/').pop();
      out.push(`<div style="border:2px dashed #c0c4cc;padding:14px;margin:12px 0;text-align:center;color:#86909c;background:#fafbfc;">【图片】在此处插入图片：<b>${base}</b><br><span style="font-size:12px;">本地文件位于 images/${base}</span></div>`);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push('<ul style="margin:12px 0;padding-left:22px;">' + buf.map((b) => `<li style="margin:6px 0;">${inline(b)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      out.push('<ol style="margin:12px 0;padding-left:22px;">' + buf.map((b) => `<li style="margin:6px 0;">${inline(b)}</li>`).join('') + '</ol>');
      continue;
    }
    if (/^---+$/.test(line.trim())) { out.push('<hr style="border:none;border-top:1px solid #e5e6eb;margin:20px 0;">'); i++; continue; }
    const buf = [];
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith('>') &&
      !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) { buf.push(lines[i]); i++; }
    out.push(`<p style="margin:12px 0;line-height:1.8;">${inline(buf.join('<br>'))}</p>`);
  }
  return out.join('\n');
}

const html = mdToHtml(body);
const full = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>公众号发布稿预览</title><style>body{max-width:720px;margin:24px auto;padding:0 16px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d2129;line-height:1.7;}</style></head><body>${html}</body></html>`;
fs.writeFileSync('article-preview.html', full, 'utf8');
console.log('已生成 article-preview.html');
console.log('标题:', fm.title, `(共 ${[...fm.title].length} 字，编辑器上限 64，可用)`);
console.log('作者:', fm.author);
console.log('摘要:', fm.description);
console.log('封面:', fm.cover);
