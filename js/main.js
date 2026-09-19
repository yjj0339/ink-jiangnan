// 主入口：标题画面 / 主循环 / 输入 / 调试钩子
import { generateMap } from './map.js';
import { Game, bus } from './game.js';
import { Renderer, TILE } from './render.js';
import { Agents } from './agents.js';
import { ui } from './ui.js';
import { sfx } from './audio.js';
import * as C from './config.js';
import * as Save from './save.js';

const $ = (s) => document.querySelector(s);

let game = null, R = null, agents = null;
let seed = (Math.random() * 1e9) | 0;
let acc = 0, lastT = 0;
let previewMap = null;

// ---------- 标题画面 ----------
function showTitle() {
  $('#title-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
  previewMap = generateMap(seed);
  drawPreview();
  // 存档按钮
  const info = Save.slotInfo('auto') || Save.slotInfo(1) || Save.slotInfo(2) || Save.slotInfo(3);
  const btn = $('#btn-continue');
  btn.classList.toggle('hidden', !info);
  if (info) btn.textContent = `继续上次 · 第${info.year}年（人口${info.pop}）`;
}

function drawPreview() {
  const cv = $('#map-preview');
  const ctx = cv.getContext('2d');
  const s = cv.width / previewMap.W;
  const cols = { 0: '#e3e4cb', 1: '#bdd2d2', 2: '#e5dcae', 3: '#cfd8b8', 4: '#cfccc0', 5: '#bfb9ab' };
  for (let y = 0; y < previewMap.H; y++) for (let x = 0; x < previewMap.W; x++) {
    const t = previewMap.terrain[y * previewMap.W + x];
    ctx.fillStyle = cols[t];
    ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
  }
  // 出生点标记
  ctx.strokeStyle = '#a8402e'; ctx.lineWidth = 1.6;
  ctx.strokeRect(previewMap.spawn.x * s - 4, previewMap.spawn.y * s - 4, 9, 9);
}

function bindTitle() {
  $('#btn-new').onclick = () => { sfx.ensure(); sfx.build(); startNew(seed); };
  $('#btn-reroll').onclick = () => { seed = (Math.random() * 1e9) | 0; showTitle(); sfx.select(); };
  $('#btn-continue').onclick = () => {
    const d = Save.loadSlot('auto') || Save.loadSlot(1) || Save.loadSlot(2) || Save.loadSlot(3);
    if (d) startFromSave(d);
  };
}

// ---------- 开局 ----------
function startNew(sd) {
  const map = generateMap(sd);
  game = new Game(map, sd);
  game.initStart();
  launchApp();
}

function startFromSave(d) {
  const map = generateMap(d.seed);
  game = Game.load(map, d);
  launchApp();
}

function launchApp() {
  $('#title-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const canvas = $('#game');
  R = new Renderer(canvas, game.map, game);
  agents = new Agents(game, R);
  ui.init(game, R);
  ui.rateAvg = {}; ui.lastSnap = null;
  Save.setupAutosave(() => game);
  R.centerOn(game.map.spawn.x + 3, game.map.spawn.y);
  lastT = performance.now();
  acc = 0;
  requestAnimationFrame(loop);
}

function loop(t) {
  const dt = Math.min(100, t - lastT);
  lastT = t;
  if (game.speed > 0) {
    acc += dt * game.speed;
    let steps = 0;
    while (acc >= C.DAY_MS && steps < 12) { game.tickDay(); acc -= C.DAY_MS; steps++; }
    if (steps >= 12) acc = 0;
  }
  R.render(dt);
  agents.update(dt / 1000);
  agents.draw(R.ctx);
  requestAnimationFrame(loop);
}

// ---------- 输入 ----------
function bindInput() {
  const canvas = $('#game');
  const pointers = new Map();
  let down = null;          // {id, x, y, sx, sy, moved, button}
  let pinch = null;         // {dist, cx, cy}
  let lastGhost = '';

  const tileFromEvent = (e) => {
    const r = canvas.getBoundingClientRect();
    return R.screenToTile(e.clientX - r.left, e.clientY - r.top);
  };

  const updateGhost = (e) => {
    if (ui.tool.mode !== 'place') { R.ghost = null; return; }
    const def = C.B[ui.tool.defId];
    const t = tileFromEvent(e);
    const gx = Math.round(t.x - def.w / 2), gy = Math.round(t.y - def.h / 2);
    const chk = game.canPlace(ui.tool.defId, gx, gy);
    const ok = chk.ok && game.canAfford(def.cost);
    R.ghost = { defId: ui.tool.defId, x: gx, y: gy, ok, reason: chk.reason };
  };

  const tryPlace = (e, paint = false) => {
    if (ui.tool.mode !== 'place') return;
    updateGhost(e);
    const gh = R.ghost;
    if (!gh) return;
    const key = gh.defId + ':' + gh.x + ',' + gh.y;
    if (paint && key === lastGhost) return;
    lastGhost = key;
    if (!gh.ok) {
      if (!paint) { sfx.error(); ui.toast(gh.reason || '银两或物料不足', 'bad'); }
      return;
    }
    const b = game.place(gh.defId, gh.x, gh.y);
    if (b) {
      sfx.build();
      updateGhost(e); // 扣钱后 afford 可能变化
    }
  };

  const tryDemolish = (e, paint = false) => {
    const t = tileFromEvent(e);
    const tx = Math.floor(t.x), ty = Math.floor(t.y);
    const key = 'D' + tx + ',' + ty;
    if (paint && key === lastGhost) return;
    lastGhost = key;
    const b = game.buildingAt(tx, ty);
    if (b) { game.demolish(tx, ty); sfx.demolish(); }
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      down = null;
      return;
    }
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, button: e.button };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch.dist > 0) R.zoomAt(cx, cy, dist / pinch.dist);
      R.cam.x -= (cx - pinch.cx) / (R.cam.z * TILE);
      R.cam.y -= (cy - pinch.cy) / (R.cam.z * TILE);
      R.clampCam();
      pinch = { dist, cx, cy };
      return;
    }
    if (down && e.pointerId === down.id) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(e.clientX - down.sx) + Math.abs(e.clientY - down.sy) > 6) {
        down.moved = true;
        // 平移（放置道路时可刷）
        if (ui.tool.mode === 'view' || down.button === 2 || ui.tool.mode === 'demolish' || ui.tool.defId === 'road') {
          if (ui.tool.mode === 'view' || down.button === 2) {
            R.cam.x -= dx / (R.cam.z * TILE);
            R.cam.y -= dy / (R.cam.z * TILE);
            R.clampCam();
          }
        }
      }
      down.x = e.clientX; down.y = e.clientY;
      if (down.moved && down.button !== 2) {
        if (ui.tool.mode === 'demolish') tryDemolish(e, true);
        else if (ui.tool.mode === 'place' && ui.tool.defId === 'road') tryPlace(e, true);
        else if (ui.tool.mode === 'place') updateGhost(e);
      } else if (ui.tool.mode === 'place') updateGhost(e);
    } else if (ui.tool.mode === 'place') updateGhost(e);
  });

  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (down && e.pointerId === down.id) {
      if (!down.moved && down.button !== 2) {
        const t = tileFromEvent(e);
        const tx = Math.floor(t.x), ty = Math.floor(t.y);
        if (ui.tool.mode === 'place') tryPlace(e);
        else if (ui.tool.mode === 'demolish') tryDemolish(e);
        else {
          const b = game.buildingAt(tx, ty);
          ui.select(b ? b.uid : 0);
        }
      }
      down = null;
      lastGhost = '';
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    R.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89);
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ui.setTool('view');
  });

  window.addEventListener('resize', () => { if (R) R.resize(); });

  // 缩放按钮
  $('#zoom-in').onclick = () => R.zoomAt(R.cw / 2, R.ch / 2, 1.25);
  $('#zoom-out').onclick = () => R.zoomAt(R.cw / 2, R.ch / 2, 0.8);
  $('#zoom-fit').onclick = () => R.fitView();
}

// ---------- 调试钩子（自动化测试用） ----------
function setupHooks() {
  window.__start = (sd) => { if (sd) seed = sd; startNew(seed); };
  window.__startFromSave = startFromSave;
  window.__ui = ui;
  Object.defineProperty(window, '__game', { get: () => game });
  Object.defineProperty(window, '__R', { get: () => R });
  window.__state = () => game && {
    day: game.day, year: game.year, season: game.seasonName, pop: game.pop,
    hap: game.hap, silver: game.silver, res: { ...game.res },
    buildings: game.buildings.length, quests: game.quests.idx, techs: [...game.techs],
    housingCap: game.housingCapacity(),
  };
  window.__sim = (days) => { for (let i = 0; i < days; i++) game.tickDay(); return window.__state(); };
  window.__place = (id, x, y) => { const b = game.place(id, x, y, true); return b ? { ok: true, uid: b.uid } : { ok: false }; };
  window.__give = (what, n) => {
    if (what === 'silver') game.silver += n; else game.res[what] += n;
  };
}

// ---------- 启动 ----------
window.addEventListener('DOMContentLoaded', () => {
  bindTitle();
  bindInput();
  setupHooks();
  const params = new URLSearchParams(location.search);
  if (params.get('test')) {
    // 测试模式：跳过标题直接开局（固定种子，可复现）
    seed = Number(params.get('seed')) || 20260920;
    startNew(seed);
    if (params.get('sim')) window.__sim(Number(params.get('sim')));
  } else {
    showTitle();
  }
});
