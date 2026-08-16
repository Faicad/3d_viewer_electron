import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ARTICLE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = path.join(ARTICLE_DIR, '.pw-profile');
const LOG = path.join(ARTICLE_DIR, '.publish', 'view.log');
const fs2 = fs;
const log = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); try { fs2.appendFileSync(LOG, s + '\n'); } catch (e) {} console.log(s); };

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = ctx.pages()[0] || await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') log('PAGE_ERR', m.text().slice(0, 120)); });

await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded' }).catch(e => log('HOME_ERR', e.message));
await page.waitForTimeout(3500);

// 提取 token
const token = await page.evaluate(() => {
  const m = location.href.match(/[?&]token=(\d+)/);
  if (m) return m[1];
  const a = document.querySelector('a[href*="token="]');
  if (a) { const mm = a.href.match(/token=(\d+)/); if (mm) return mm[1]; }
  return '';
});
log('TOKEN', token ? 'got' : 'missing', 'url', page.url().slice(0, 90));

if (!token) {
  log('NO_TOKEN — 可能登录态失效，需要重新扫码');
  await page.screenshot({ path: path.join(ARTICLE_DIR, '.publish', 'view-need-login.png') });
} else {
  // 草稿箱
  const draftUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=appmsg_list&action=edit&lang=zh_CN&type=10&token=${token}`;
  await page.goto(draftUrl, { waitUntil: 'networkidle' }).catch(e => log('DRAFT_ERR', e.message));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(ARTICLE_DIR, '.publish', 'draft-box.png'), fullPage: true });
  log('DRAFT_BOX_SHOT done');

  // 尝试点击第一个草稿的"编辑/修改"进入编辑器
  const editSel = [
    'a[data-op="edit"]',
    'a.js_edit',
    'a:has-text("编辑")',
    'a:has-text("修改")',
    '.appmsg_item a',
  ];
  let opened = false;
  for (const sel of editSel) {
    const el = page.locator(sel).first();
    if (await el.count() > 0) {
      await el.click().catch(e => log('CLICK_ERR', sel, e.message));
      opened = true;
      log('OPEN_DRAFT_CLICK', sel);
      break;
    }
  }
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(ARTICLE_DIR, '.publish', 'draft-editor.png'), fullPage: true });
  log('DRAFT_EDITOR_SHOT done', 'opened=', opened);
}

// 保持浏览器打开，不调用 browser.close()
log('BROWSER_KEPT_OPEN — 用户可查看效果');
await new Promise(() => {});
