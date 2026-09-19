// 冒烟测试：加载 / 开局 / 建造 / 快进 / 弹窗 / 移动端 截图与断言
// 用法: node tests/smoke.js   （需先启动 node tools/server.js）
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8123';
mkdirSync('shots', { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launch() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await chromium.launch({ channel, headless: true }); }
    catch (e) { console.log(`channel ${channel} 不可用: ${e.message.split('\n')[0]}`); }
  }
  throw new Error('无可用浏览器');
}

let fails = 0;
const assert = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fails++; };

const browser = await launch();
const errors = [];

async function newPage(w, h, url) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[pageerror] ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  return { ctx, page };
}

// ---------- 桌面端 ----------
{
  const { ctx, page } = await newPage(1440, 900, `${BASE}/?test=1&seed=20260920`);
  await page.waitForSelector('#game', { state: 'visible', timeout: 8000 });
  await sleep(1200);
  await page.screenshot({ path: 'shots/01-desktop-start.png' });

  let st = await page.evaluate(() => window.__state());
  assert(st && st.pop >= 4, `开局状态正常（人口 ${st.pop}，建筑 ${st.buildings}）`);
  assert(st.buildings >= 8, `开局赠建到位（${st.buildings} 座）`);

  // 程序化建造：农田/伐木场/粮仓/水井/集市 附近找空地
  const placed = await page.evaluate(() => {
    const g = window.__game;
    const s = g.map.spawn;
    const tryPlace = (id, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (g.canPlace(id, x, y).ok && g.hasRoadAccess({ x, y, def: { w: 1, h: 1 } })) return !!window.__place(id, x, y);
      }
      // 自动修路连接版
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (g.canPlace(id, x, y).ok) {
          window.__place('road', x - 1, y); window.__place('road', x - 2, y);
          if (window.__place(id, x, y).ok) return true;
        }
      }
      return false;
    };
    return ['farm', 'lumber', 'granary', 'well', 'market', 'carpenter'].map(id => ({ id, ok: tryPlace(id, 12) }));
  });
  assert(placed.every(p => p.ok), `程序化建造全部成功 ${JSON.stringify(placed)}`);

  // 快进两年
  st = await page.evaluate(() => window.__sim(120));
  assert(st.res.food > 0 || st.pop > 10, `快进后粮食/人口正常（粮 ${Math.round(st.res.food)}，人口 ${Math.floor(st.pop)}）`);
  await sleep(800);
  await page.screenshot({ path: 'shots/02-desktop-grown.png' });

  // 弹窗
  await page.evaluate(() => window.__ui.openModal('tech'));
  await sleep(300);
  await page.screenshot({ path: 'shots/03-modal-tech.png' });
  await page.evaluate(() => window.__ui.closeModal());
  await page.evaluate(() => window.__ui.openModal('quest'));
  await sleep(300);
  await page.screenshot({ path: 'shots/04-modal-quest.png' });
  await page.evaluate(() => window.__ui.closeModal());
  await page.evaluate(() => window.__ui.openModal('stats'));
  await sleep(300);
  await page.screenshot({ path: 'shots/05-modal-stats.png' });
  await page.evaluate(() => window.__ui.closeModal());

  // 检视面板
  await page.evaluate(() => {
    const g = window.__game;
    const b = g.buildings.find(o => o.defId === 'hut');
    window.__ui.select(b.uid);
  });
  await sleep(300);
  await page.screenshot({ path: 'shots/06-inspector.png' });

  // 建造面板与放置模式
  await page.click('#palette-tabs .ptab:nth-child(3)'); // 农耕
  await sleep(200);
  await page.screenshot({ path: 'shots/07-palette.png' });

  // 存档往返
  const saved = await page.evaluate(() => {
    const g = window.__game;
    const data = g.toJSON();
    return { day: data.day, buildings: data.buildings.length, pop: data.pop };
  });
  assert(saved.buildings > 8, `序列化完整（${saved.buildings} 座建筑）`);
  await ctx.close();
}

// ---------- 标题画面 ----------
{
  const { ctx, page } = await newPage(1440, 900, `${BASE}/`);
  await page.waitForSelector('#title-screen:not(.hidden)');
  await sleep(800);
  await page.screenshot({ path: 'shots/08-title.png' });
  await ctx.close();
}

// ---------- 移动端 ----------
{
  const { ctx, page } = await newPage(390, 844, `${BASE}/?test=1&seed=20260920`);
  await page.waitForSelector('#game', { state: 'visible', timeout: 8000 });
  await sleep(1000);
  await page.evaluate(() => window.__sim(80));
  await sleep(600);
  await page.screenshot({ path: 'shots/09-mobile.png' });
  // 移动端弹窗
  await page.evaluate(() => window.__ui.openModal('tech'));
  await sleep(300);
  await page.screenshot({ path: 'shots/10-mobile-tech.png' });
  await ctx.close();
}

await browser.close();

console.log('\n----- 控制台/页面错误 -----');
if (errors.length) { errors.slice(0, 12).forEach(e => console.log('❌', e)); fails += errors.length; }
else console.log('✅ 无 console/page 错误');

process.exit(fails ? 1 : 0);
