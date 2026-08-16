// 微信公众号草稿箱发布脚本 v2（适配新版编辑器，持久化登录）
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLE_DIR = __dirname;
const PROFILE = path.join(ARTICLE_DIR, '.pw-profile');
const SHOTS = path.join(ARTICLE_DIR, '.publish');
fs.mkdirSync(SHOTS, { recursive: true });
const LOG_PATH = path.join(ARTICLE_DIR, 'publish2-run.log');
const log = (...a) => { const s = a.join(' '); console.log(s); try { fs.appendFileSync(LOG_PATH, s + '\n'); } catch (e) {} };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// 截图尽力而为，失败不影响发布主流程
const ss = async (page, name, full = false) => { try { await page.screenshot({ path: path.join(SHOTS, name), fullPage: full }); log('SHOT', name); } catch (e) { log('SHOT_ERR', name, e.message); } };

// 关闭遮挡点击的引导/教育弹窗（education-dialog 等）
async function dismissDialogs(page) {
  // 方式一：正常点击关闭按钮（试试按钮/关闭 X）
  for (let i = 0; i < 3; i++) {
    const info = await page.evaluate(() => {
      const dlg = document.querySelector('.education-dialog, .weui-desktop-dialog');
      if (!dlg) return { done: true };
      const primary = [...dlg.querySelectorAll('button')].find(b => /我知道了|知道了|完成|开始使用|好的|下一步|确定/.test(b.textContent));
      if (primary) { primary.click(); return { clicked: 'primary:' + primary.textContent.trim() }; }
      const close = dlg.querySelector('.weui-desktop-dialog__close-btn, [class*="close"]');
      if (close) { close.click(); return { clicked: 'close' }; }
      return { done: false };
    });
    log('DISMISS', JSON.stringify(info));
    if (info.done) break;
    await sleep(900);
  }
  // 方式二：直接移除所有弹窗遮罩（点不掉时的兜底）
  const removed = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.education-dialog, .weui-desktop-dialog__wrp, [class*="dialog"][class*="wrp"], .weui-desktop-mask')];
    let n = 0;
    for (const el of els) {
      if (el.closest('.rich_media_content, .title-editor')) continue;
      el.remove(); n++;
    }
    return n;
  });
  log('DISMISS_REMOVED', removed);
  await sleep(800);
}

const data = JSON.parse(fs.readFileSync(path.join(ARTICLE_DIR, 'article.blocks.json'), 'utf-8'));
const { meta, blocks } = data;

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    viewport: { width: 1440, height: 900 },
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://mp.weixin.qq.com' });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(90000);
  page.on('console', m => { if (m.type() === 'error') log('PAGE_ERR', m.text()); });

  // ---------- 登录 ----------
  log('=== 打开 mp.weixin.qq.com ===');
  let navOk = false;
  for (let attempt = 0; attempt < 3 && !navOk; attempt++) {
    try {
      await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'commit', timeout: 90000 });
      navOk = true;
    } catch (e) { log('NAV_RETRY', attempt, e.message); }
  }
  if (!navOk) { log('NAV_FAILED'); try { await context.close(); } catch (e) {}; process.exit(2); }
  await sleep(2500);
  // 等待登录态/重定向稳定（微信首页是重 SPA，慢网下 domcontentloaded 很慢，故用轮询）
  await page.waitForFunction(() => /cgi-bin\/home|cgi-bin\/frame/.test(location.href) || !!document.querySelector('.weui-desktop-account__name, #menuBar, a[href*="draft"]'), { timeout: 90000 }).catch(() => log('LOGIN_SETTLE_TIMEOUT'));
  const isLoggedIn = () => page.evaluate(() => {
    const u = location.href;
    if (u.includes('cgi-bin/home') || u.includes('cgi-bin/frame')) return true;
    return !!document.querySelector('.weui-desktop-account__name, #menuBar, a[href*="draft"], .global_nav');
  });
  if (!(await isLoggedIn())) {
    log('需要扫码登录');
    for (let attempt = 0; attempt < 6; attempt++) {
      await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'commit' });
      await sleep(2000);
      await page.screenshot({ path: path.join(SHOTS, 'qr.png') });
      log('QR_SHOWN attempt', attempt);
      try {
        await page.waitForFunction(() => {
          const u = location.href;
          if (u.includes('cgi-bin/home') || u.includes('cgi-bin/frame')) return true;
          return !!document.querySelector('.weui-desktop-account__name, #menuBar, a[href*="draft"]');
        }, { timeout: 180000 });
        break;
      } catch { log('LOGIN_WAIT_TIMEOUT', attempt); }
    }
  }
  log('LOGIN_OK');
  await ss(page, 'home.png');

  // ---------- 进入新建图文 ----------
  const token = await page.evaluate(() => new URLSearchParams(location.search).get('token') || '');
  log('TOKEN', token ? '(got)' : '(none)');
  const composeUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&lang=zh_CN&token=${token}`;
  await page.goto(composeUrl, { waitUntil: 'commit' });
  await sleep(4500);
  await ss(page, 'compose2.png');
  log('COMPOSE_LOADED', page.url());

  // 等待内容区 .ProseMirror 出现
  await page.waitForSelector('.ProseMirror', { timeout: 90000 });
  log('EDITOR_READY');

  // ---------- 关闭可能的引导/教育弹窗 ----------
  await dismissDialogs(page);
  await ss(page, 'after-dismiss.png');

  // ---------- 填标题 / 作者 ----------
  try {
    await dismissDialogs(page);
    await page.locator('.title-editor__input .ProseMirror').click({ timeout: 8000, force: true });
    await page.keyboard.type(meta.title, { delay: 20 });
    log('TITLE_TYPED', meta.title);
  } catch (e) { log('TITLE_FAIL', e.message); }
  await page.fill('#author', meta.author_name, { timeout: 5000 }).then(() => log('AUTHOR_FILLED', meta.author_name)).catch(e => log('AUTHOR_FAIL', e.message));

  // 摘要（最佳努力）
  try {
    const toggled = await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && /摘要/.test(e.textContent || ''));
      if (els.length) { els[0].click(); return true; }
      return false;
    });
    await sleep(600);
    const dig = await page.$('#digest, textarea[name="digest"], .js_digest, .digest_editor textarea');
    if (dig) { await dig.fill(meta.digest); log('DIGEST_FILLED'); }
    else log('DIGEST_FIELD_NOT_FOUND (toggled=' + toggled + ')');
  } catch (e) { log('DIGEST_FAIL', e.message); }

  // ---------- 插入正文（文本用剪贴板粘贴，图片用上传，保顺序） ----------
  const insertHtml = async (html) => {
    await dismissDialogs(page);
    await page.evaluate(async (h) => {
      const blob = new Blob([h], { type: 'text/html' });
      const plain = new Blob([h.replace(/<[^>]+>/g, ' ')], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': plain })]);
    }, html);
    await page.locator('.rich_media_content .ProseMirror').first().click({ position: { x: 5, y: 5 }, force: true });
    await page.evaluate(() => {
      const pm = document.querySelector('.rich_media_content .ProseMirror');
      pm.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(pm);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.keyboard.press('Control+v');
    await sleep(700);
  };

  const insertImage = async (src, alt, idx) => {
    // 打开图片下拉并定位本地上传 input
    await dismissDialogs(page);
    await page.evaluate(() => { const el = document.querySelector('#js_editor_insertimage'); if (el) el.click(); });
    await sleep(500);
    const input = page.locator('#js_editor_insertimage .js_img_dropdown_menu input[type="file"]').first();
    const before = await page.locator('.rich_media_content .ProseMirror img').count();
    try { await input.setInputFiles(src); log('IMG_FILE_SET', idx, src); }
    catch (e) { log('IMG_FILE_FAIL', idx, e.message); return; }
    // 等待图片插入
    let ok = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const after = await page.locator('.rich_media_content .ProseMirror img').count();
      if (after > before) { ok = true; log('IMG_INSERTED', idx, 'count', after); break; }
    }
    if (!ok) log('IMG_INSERT_TIMEOUT', idx);
    // 关闭下拉
    await page.locator('.rich_media_content .ProseMirror').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await sleep(400);
  };

  let buf = [];
  let imgIdx = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'html') {
      buf.push(b.html);
    } else {
      if (buf.length) { await insertHtml(buf.join('\n')); buf = []; }
      imgIdx++;
      await insertImage(b.src, b.alt, imgIdx);
    }
  }
  if (buf.length) await insertHtml(buf.join('\n'));
  log('CONTENT_INSERT_DONE');

  const stat = await page.evaluate(() => ({ len: document.querySelector('.rich_media_content .ProseMirror').innerHTML.length, imgs: document.querySelectorAll('.rich_media_content .ProseMirror img').length }));
  log('EDITOR_STAT', JSON.stringify(stat));
  await ss(page, 'content-done.png', true);

  // ---------- 上传封面 ----------
  log('--- 上传封面 ---');
  try {
    await page.evaluate(() => {
      const els = [...document.querySelectorAll('*')].filter(e => e.childElementCount === 0 && /封面/.test(e.textContent || ''));
      if (els.length) els[0].click();
    });
    await sleep(800);
    await ss(page, 'cover-modal.png');
    const cinput = page.locator('input[type="file"][accept*="image"]').first();
    if (await cinput.count()) {
      await cinput.setInputFiles(meta.cover); log('COVER_FILE_SET', meta.cover);
      await sleep(4000);
      // 确认选择封面
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')];
        const b = btns.find(x => /确定|完成|保存/.test(x.textContent));
        if (b) b.click();
      });
      await sleep(1500);
    } else log('COVER_INPUT_NOT_FOUND');
  } catch (e) { log('COVER_FAIL', e.message); }
  await ss(page, 'after-cover.png');

  // ---------- 保存草稿（用原生 click + 网络监听） ----------
  log('--- 保存草稿 ---');
  await dismissDialogs(page);

  // 监听保存相关的网络请求
  let saveApiCalled = false;
  let saveApiResponse = null;
  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('appmsg') && (url.includes('save') || url.includes('draft') || url.includes('edit'))) {
      saveApiCalled = true;
      try { saveApiResponse = { status: resp.status(), url: url.slice(0, 120) }; } catch (e) {}
      log('SAVE_API', resp.status(), url.slice(0, 100));
    }
  });

  // 用 Playwright 原生点击（不用 JS evaluate）
  const saveBtn = page.locator('text=保存为草稿');
  const btnCount = await saveBtn.count();
  log('SAVE_BTN_COUNT', btnCount);

  if (btnCount > 0) {
    await saveBtn.first().click({ timeout: 5000 });
    log('SAVE_CLICKED_NATIVE');
  } else {
    // 备选：找任何包含"保存为草稿"文字的可点击元素
    log('SAVE_BTN_NOT_FOUND_BY_TEXT, trying broader selector');
    await page.locator('#js_send, .save-btn, [data-type="draft"], button:has-text("草稿")').first().click({ timeout: 3000 }).catch(e => log('FALLBACK_CLICK_FAIL', e.message));
  }

  // 等待保存完成：监听网络响应 + 检查 toast + 等 URL 变化
  let savedOk = false;
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    // 检查是否有错误提示
    const errMsg = await page.evaluate(() => {
      const el = document.querySelector('.weui-desktop-toast, .js_editor_tip, [class*="toast_error"], [class*="error-msg"]');
      return el ? el.textContent.trim() : '';
    }).catch(() => '');
    if (errMsg) { log('ERROR_TOAST', errMsg); }

    // 检查是否跳转到了列表页或出现了成功提示
    const url = page.url();
    if (url.includes('appmsg_list') || url.includes('t=media/appmsg_edit') === false) {
      savedOk = true;
      log('URL_CHANGED_AFTER_SAVE', url.slice(0, 100));
      break;
    }
    // 检查成功 toast
    const okMsg = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="toast"], [class*="tip"], [class*="notice"]')];
      return els.map(e => e.textContent.trim()).find(t => /成功|已保存|保存完成/.test(t)) || '';
    }).catch(() => '');
    if (okMsg) { savedOk = true; log('SUCCESS_TOAST', okMsg); }

    if (saveApiCalled && i > 5) {
      savedOk = true;
      log('SAVE_API_CONFIRMED', JSON.stringify(saveApiResponse));
      break;
    }
  }

  await sleep(2000);
  await ss(page, 'after-save.png', true);
  log('SAVE_RESULT', savedOk ? 'OK' : 'UNCERTAIN', 'api_called', saveApiCalled);

  // 验证：通过左侧菜单进草稿箱确认文章存在（best-effort，不阻塞结果）
  try {
    log('--- 验证草稿箱 ---');
    const curToken = new URL(page.url()).searchParams.get('token') || '';
    await page.goto(`https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=${curToken}`, { waitUntil: 'domcontentloaded' }).catch(e => log('HOME_NAV_ERR', e.message));
    await sleep(3000);
    const mgmtMenu = page.locator('text=内容管理').first();
    if (await mgmtMenu.count() > 0) {
      await mgmtMenu.click(); log('CLICKED_内容管理');
      await sleep(2000);
    }
    const draftLink = page.locator('a', { hasText: '草稿箱' }).first();
    if (await draftLink.count() > 0) {
      await draftLink.click(); log('CLICKED_草稿箱_LINK');
    } else {
      await page.goto(`https://mp.weixin.qq.com/cgi-bin/appmsg?t=appmsg_list&action=list&lang=zh_CN&token=${curToken}`, { waitUntil: 'domcontentloaded' }).catch(e => log('LIST_URL_ERR', e.message));
    }
    await sleep(5000);
    await ss(page, 'draft-list.png', true);
    const draftCount = await page.locator('.appmsg_item, .weui-desktop-media-appmsg_item').count().catch(() => -1);
    log('DRAFT_COUNT', draftCount);
  } catch (e) { log('VERIFY_ERR', e.message); }

  log('=== 草稿已保存，关闭浏览器 ===');
  try { await context.close(); } catch (e) { log('CLOSE_ERR', e.message); }
}
main().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
