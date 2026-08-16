// 微信公众号草稿箱发布脚本（浏览器自动化，无 API 凭证）
// 用法: node publish.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLE_DIR = __dirname;
const PROFILE = path.join(ARTICLE_DIR, '.pw-profile');
const SHOTS = path.join(ARTICLE_DIR, '.publish');
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => { const s = a.join(' '); console.log(s); fs.appendFileSync(path.join(SHOTS, 'publish.log'), s + '\n'); };
const shot = async (page, name) => { try { await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); log('SHOT', name); } catch (e) { log('SHOT_ERR', name, e.message); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const data = JSON.parse(fs.readFileSync(path.join(ARTICLE_DIR, 'article.blocks.json'), 'utf-8'));
const { meta, blocks } = data;

// 多候选选择器点击
async function clickAny(page, selectors, label) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click({ timeout: 4000 }); log('CLICK_OK', label, '->', sel); return true; }
    } catch (e) { /* try next */ }
  }
  log('CLICK_FAIL', label, JSON.stringify(selectors));
  return false;
}

// 找到编辑器 iframe（UEditor: #ueditor_0）
async function getEditorFrame(page) {
  const ids = ['ueditor_0', 'ueditor_1'];
  for (const id of ids) {
    const f = page.frames().find(fr => fr.url().includes('ueditor') || fr.name() === id);
    if (f) return f;
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ userDataDir: PROFILE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') log('PAGE_ERR', m.text()); });

  // ---------- 登录 ----------
  log('=== 打开 mp.weixin.qq.com ===');
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // 是否已登录
  const isLoggedIn = async () => {
    const u = page.url();
    if (u.includes('cgi-bin/home') || u.includes('cgi-bin/frame')) return true;
    return await page.evaluate(() => !!document.querySelector('.weui-desktop-account__name, #menuBar, .global_nav, a[href*="draft"]'));
  };

  if (!(await isLoggedIn())) {
    log('需要扫码登录');
    let scanned = false;
    for (let attempt = 0; attempt < 6 && !scanned; attempt++) {
      await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' });
      await sleep(2000);
      await shot(page, 'qr.png');
      log('QR_SHOWN attempt', attempt, path.join(SHOTS, 'qr.png'));
      try {
        await page.waitForFunction(() => {
          const u = location.href;
          if (u.includes('cgi-bin/home') || u.includes('cgi-bin/frame')) return true;
          return !!document.querySelector('.weui-desktop-account__name, #menuBar, a[href*="draft"]');
        }, { timeout: 180000 });
        scanned = true;
      } catch (e) {
        log('LOGIN_WAIT_TIMEOUT attempt', attempt, '重新刷新二维码');
      }
    }
    if (!scanned) { log('LOGIN_FAILED'); await browser.close(); process.exit(2); }
  }
  log('LOGIN_OK');
  await shot(page, 'home.png');

  // ---------- 进入新建图文 ----------
  const token = await page.evaluate(() => new URLSearchParams(location.search).get('token') || '');
  log('TOKEN', token ? '(got)' : '(none)');
  const composeUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&lang=zh_CN&token=${token}`;
  await page.goto(composeUrl, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  await shot(page, 'compose.png');

  // 等待编辑器 iframe 就绪
  let frame = null;
  for (let i = 0; i < 20; i++) {
    frame = await getEditorFrame(page);
    if (frame) break;
    await sleep(1000);
  }
  if (!frame) {
    log('EDITOR_FRAME_NOT_FOUND; 转储页面结构以供分析');
    const dump = await page.evaluate(() => ({
      url: location.href,
      iframes: [...document.querySelectorAll('iframe')].map(f => ({ id: f.id, name: f.name, src: f.src.slice(0, 80) })),
      bodyHtml: document.body.innerHTML.slice(0, 4000),
    }));
    fs.writeFileSync(path.join(SHOTS, 'dom_dump.json'), JSON.stringify(dump, null, 2));
    await browser.close();
    process.exit(3);
  }
  log('EDITOR_FRAME_OK', frame.url().slice(0, 60));
  await frame.evaluate(() => document.body.focus());

  // ---------- 填标题 / 作者 / 摘要 ----------
  await clickAny(page, ['#title', 'input.title_input', 'input[id="title"]'], 'title-input');
  await sleep(400);
  try { await page.fill('#title', meta.title, { timeout: 4000 }); log('TITLE_FILLED', meta.title); }
  catch (e) { log('TITLE_FILL_FAIL', e.message); }

  await clickAny(page, ['#author', 'input[id="author"]', 'input.author_input'], 'author-input');
  await sleep(300);
  try { await page.fill('#author', meta.author_name, { timeout: 4000 }); log('AUTHOR_FILLED', meta.author_name); }
  catch (e) { log('AUTHOR_FILL_FAIL', e.message); }

  // 摘要：尝试展开并填入
  try {
    const digested = await page.evaluate((dig) => {
      const el = document.querySelector('#digest') || document.querySelector('textarea[name="digest"]');
      if (el) { el.value = dig; el.dispatchEvent(new Event('input', { bubbles: true })); return true; }
      return false;
    }, meta.digest);
    log('DIGEST', digested ? 'FILLED' : 'FIELD_NOT_FOUND(auto)');
  } catch (e) { log('DIGEST_FAIL', e.message); }

  // ---------- 上传封面 ----------
  log('--- 上传封面 ---');
  const coverClicked = await clickAny(page, ['.cover_box', '#cover', 'a.js_cover, .js_cover', 'div[class*="cover"]'], 'cover-open');
  await sleep(1500);
  await shot(page, 'cover-modal.png');
  // 在封面弹窗里点“上传图片”并选文件
  if (coverClicked) {
    await clickAny(page, ['.js_upload_tab', 'a[href*="upload"]', 'li:has-text("上传图片")', '.tab_item'], 'cover-upload-tab');
    await sleep(800);
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      try { await fileInput.setInputFiles(meta.cover); log('COVER_FILE_SET', meta.cover); await sleep(3000); await shot(page, 'cover-uploaded.png'); }
      catch (e) { log('COVER_FILE_FAIL', e.message); }
    } else { log('COVER_FILE_INPUT_NOT_FOUND'); }
    await clickAny(page, ['.btn.btn_primary[data-index], .dialog_cover .btn_primary, button:has-text("确定")', '.edui-btn .edui-state-enabled'], 'cover-confirm');
    await sleep(1000);
  }
  await shot(page, 'after-cover.png');

  // ---------- 插入正文区块 ----------
  log('--- 插入正文 (', blocks.length, '块) ---');
  let imgIdx = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'html') {
      await frame.evaluate((html) => {
        const body = document.body;
        body.focus();
        document.execCommand('insertHTML', false, html + '\n');
      }, b.html);
      await sleep(120);
    } else {
      imgIdx++;
      log('IMG', imgIdx, b.alt, b.src);
      // 点击编辑器“图片”工具栏按钮
      const opened = await clickAny(page, [
        'div.edui-for-insertimage .edui-icon',
        '[title="图片"]',
        '.edui-for-insertimage',
        'a[class*="insertimage"]',
      ], 'img-btn-' + imgIdx);
      await sleep(1500);
      await shot(page, `img-modal-${imgIdx}.png`);
      if (opened) {
        // 切到上传 tab 并设置文件
        await clickAny(page, ['.webuploader-element-invisible', 'input[type="file"]', '.edui-dialog input[type=file]'], 'img-file-' + imgIdx);
        const fi = await page.$('input[type="file"]');
        if (fi) {
          try { await fi.setInputFiles(b.src); log('IMG_FILE_SET', imgIdx, b.src); await sleep(4000); await shot(page, `img-uploaded-${imgIdx}.png`); }
          catch (e) { log('IMG_FILE_FAIL', imgIdx, e.message); }
        }
        // 选中缩略图并确认插入
        await clickAny(page, ['.edui-dialog .img_list img', '.edui-dialog-content .list img', '.edui-dialog img'], 'img-thumb-' + imgIdx);
        await sleep(500);
        await clickAny(page, ['.edui-dialog .edui-btn-primary', 'button:has-text("确认")', 'button:has-text("确定")', '.edui-dialog .btn_primary'], 'img-confirm-' + imgIdx);
        await sleep(1500);
        await shot(page, `img-inserted-${imgIdx}.png`);
      }
    }
  }
  await shot(page, 'content-done.png');

  // 转储编辑器内容长度用于校验
  const len = await frame.evaluate(() => document.body.innerHTML.length);
  log('EDITOR_HTML_LEN', len);

  // ---------- 保存到草稿 ----------
  log('--- 保存草稿 ---');
  const saved = await clickAny(page, [
    'button:has-text("保存")',
    '.edui-btn-toolbar .btn_save',
    'a.js_save, .js_save',
    '#save',
  ], 'save-draft');
  await sleep(3000);
  await shot(page, 'after-save.png');
  log('SAVE_CLICKED', saved);
  log('=== 完成，等待查看草稿箱 ===');
  // 给一点时间让 toast/跳转完成
  await sleep(2000);
  await shot(page, 'final.png');
  await browser.close();
  log('DONE');
}

main().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
