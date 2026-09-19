// 无头经济模拟：验证平衡框架 —— 闲置承压 / 普通运营盈余 / 优化经营高盈利
// 用法: node tools/sim.js
import { generateMap } from '../js/map.js';
import { Game } from '../js/game.js';
import * as C from '../js/config.js';

const YEARS = 8;
const DAYS = YEARS * C.YEAR_LEN;

// ---------- 通用放置助手 ----------
function makeFinder(g) {
  const s = g.map.spawn;
  return function findSpot(defId, maxR = 16, pred = null) {
    const def = C.B[defId];
    const cands = [];
    for (let y = -maxR; y <= maxR; y++) for (let x = -maxR; x <= maxR; x++) {
      cands.push([s.x + x, s.y + y]);
    }
    cands.sort((a, b) =>
      (Math.abs(a[0] - s.x) + Math.abs(a[1] - s.y)) - (Math.abs(b[0] - s.x) + Math.abs(b[1] - s.y)));
    for (const [x, y] of cands) {
      if (!g.canPlace(defId, x, y).ok) continue;
      if (!g.hasRoadAccess({ x, y, def })) continue;
      if (pred && !pred(x, y)) continue;
      return { x, y };
    }
    return null;
  };
}

function buildRoads(g) {
  const s = g.map.spawn;
  const tryRoad = (x, y) => { if (g.canPlace('road', x, y).ok) g.place('road', x, y, true); };
  for (let i = -2; i <= 12; i++) tryRoad(s.x + i, s.y);
  for (let j = -4; j <= 8; j++) tryRoad(s.x + 6, s.y + j);
  for (let i = 0; i <= 6; i++) tryRoad(s.x + i, s.y - 4);
}

function tryBuild(g, find, defId, pred = null) {
  const def = C.B[defId];
  if (!g.canAfford(def.cost)) return false;
  // 先找已临路的位置；找不到就自动修路连接（真实玩家行为）
  let spot = find(defId, 28, pred);
  if (spot) return !!g.place(defId, spot.x, spot.y);
  spot = findLoose(g, defId, 30, pred);
  if (!spot) return false;
  if (!connectRoad(g, spot, def)) return false;
  return !!g.place(defId, spot.x, spot.y);
}

function findLoose(g, defId, maxR = 20, pred = null) {
  const s = g.map.spawn;
  const cands = [];
  for (let y = -maxR; y <= maxR; y++) for (let x = -maxR; x <= maxR; x++) cands.push([s.x + x, s.y + y]);
  cands.sort((a, b) =>
    (Math.abs(a[0] - s.x) + Math.abs(a[1] - s.y)) - (Math.abs(b[0] - s.x) + Math.abs(b[1] - s.y)));
  for (const [x, y] of cands) {
    if (!g.canPlace(defId, x, y).ok) continue;
    if (pred && !pred(x, y)) continue;
    return { x, y };
  }
  return null;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 自既有路网 BFS 到目标建筑邻接格，沿途铺路（费用照扣）
function connectRoad(g, spot, def) {
  if (g.hasRoadAccess({ x: spot.x, y: spot.y, def })) return true;
  const W = g.map.W, H = g.map.H;
  const dist = new Map(), prev = new Map();
  let q = [];
  for (const r of g.roads) { dist.set(r, 0); q.push(r); }
  const isAdj = (x, y) =>
    x >= spot.x - 1 && x <= spot.x + def.w && y >= spot.y - 1 && y <= spot.y + def.h &&
    !(x >= spot.x && x < spot.x + def.w && y >= spot.y && y < spot.y + def.h);
  let goal = -1;
  outer: while (q.length) {
    const nq = [];
    for (const i of q) {
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (dist.has(j)) continue;
        if (g.map.terrain[j] === C.TERRAIN.WATER) continue;
        if (g.occ[j]) continue;
        const d = dist.get(i) + 1;
        if (d > 18) continue;
        dist.set(j, d); prev.set(j, i);
        if (isAdj(nx, ny)) { goal = j; break outer; }
        nq.push(j);
      }
    }
    q = nq;
  }
  if (goal < 0) return false;
  const path = [];
  let cur = goal;
  while (!g.roads.has(cur)) {
    path.push(cur);
    const p = prev.get(cur);
    if (p === undefined) return false;
    cur = p;
  }
  for (const j of path.reverse()) {
    const x = j % W, y = (j / W) | 0;
    if (!g.place('road', x, y)) return false;
  }
  return g.hasRoadAccess({ x: spot.x, y: spot.y, def });
}

// 农田优先选沃土集中处
function fertScore(g) {
  return (x, y) => {
    let n = 0;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++)
      if (g.map.terrain[(y + dy) * g.map.W + (x + dx)] === C.TERRAIN.FERTILE) n++;
    return n === 9;
  };
}

const TECH_PLAN = ['papermaking', 'agronomy', 'architecture', 'porcelain', 'astronomy', 'hydraulics', 'medicine', 'opera', 'stargazing', 'navigation'];

function manageTech(g) {
  if (!g.researching && g.count('academy') > 0) {
    const next = TECH_PLAN.find(t => !g.techs.has(t) && C.TECHS.find(x => x.id === t).req.every(r => g.techs.has(r)));
    if (next) g.researching = next;
  }
}

function upgradeHouses(g) {
  for (const b of g.buildings) {
    if (b.defId !== 'hut') continue;
    const chk = g.canUpgradeHouse(b);
    if (chk.ok) g.upgradeHouse(b);
  }
}

// ---------- 三种剧本 ----------
function scenario(name, actor) {
  const map = generateMap(20260920);
  const g = new Game(map, 20260920);
  g.initStart();
  buildRoads(g);
  const rows = [];
  for (let d = 1; d <= DAYS; d++) {
    actor(g, d);
    g.tickDay();
    if (d % C.YEAR_LEN === 0) {
      rows.push({ y: g.year, pop: Math.floor(g.pop), hap: Math.round(g.hap), food: Math.round(g.res.food), silver: Math.round(g.silver), techs: g.techs.size, quests: g.quests.idx, built: g.stats.built, rp: Math.round(g.rp), res: g.researching, acad: g.count('academy'), jobs: g.jobs, pool: g.pool });
    }
  }
  console.log(`\n===== 剧本：${name} =====`);
  console.log('年  人口  幸福  存粮   白银  科技 任务 建筑  研究点 在研 书院 岗/工');
  for (const r of rows) console.log(`Y${r.y}   ${String(r.pop).padStart(4)}  ${String(r.hap).padStart(4)} ${String(r.food).padStart(6)} ${String(r.silver).padStart(6)}    ${r.techs}   ${r.quests}   ${r.built}   ${String(r.rp).padStart(4)}  ${r.res}   ${r.acad}  ${r.jobs}/${r.pool}`);
  return { g, rows };
}

// A. 闲置：只靠开局赠建
const A = scenario('闲置（无操作）', () => {});

// B. 普通经营：稳健建设
const findB = null; // per-game finder inside actor
const stateB = {};
const B = scenario('普通经营', (g, d) => {
  if (!stateB.find || stateB.g !== g) { stateB.find = makeFinder(g); stateB.g = g; }
  const find = stateB.find;
  if (d % 15 !== 1) return;
  manageTech(g);
  upgradeHouses(g);
  const plan = [
    ['farm', 2, null], ['lumber', 1, null], ['granary', 1, null], ['well', 1, null],
    ['farm', 4, null], ['market', 1, null], ['carpenter', 1, null], ['quarry', 1, null],
    ['hut', 8, null], ['granary', 2, null], ['teahouse', 1, null], ['academy', 1, null],
    ['warehouse', 2, null], ['well', 2, null], ['temple', 1, null],
  ];
  for (const [id, max, pred] of plan) {
    if (g.count(id) < max) { if (tryBuild(g, find, id, pred)) break; }
  }
});

// C. 优化经营：先人口税基 → 产业链 → 贸易 → 奢华品
const stateC = {};
const Cc = scenario('优化经营', (g, d) => {
  if (!stateC.find || stateC.g !== g) { stateC.find = makeFinder(g); stateC.g = g; }
  const find = stateC.find;
  if (d % 5 !== 1) return;
  manageTech(g);
  upgradeHouses(g);
  const plan = [
    ['farm', 2, null], ['lumber', 2, null], ['granary', 1, null], ['well', 1, null],
    ['hut', 8, null], ['market', 1, null], ['academy', 1, null], ['carpenter', 1, null],
    ['quarry', 1, null], ['farm', 4, null], ['hut', 20, null], ['tradehouse', 1, null],
    ['teahouse', 1, null], ['warehouse', 2, null], ['granary', 2, null], ['watchtower', 1, null],
    ['papermill', 2, null], ['mine', 1, null], ['kiln', 2, null], ['teahouse', 2, null],
    ['temple', 1, null], ['warehouse', 3, null], ['well', 3, null], ['stage', 1, null],
    ['dock', 1, null], ['farm', 6, null],
  ];
  for (const [id, max, pred] of plan) {
    if (g.count(id) < max) {
      if (tryBuild(g, find, id, pred)) break;
    }
  }
});

// ---------- 断言 ----------
let fail = 0;
const assert = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++; };

console.log('\n===== 平衡断言 =====');
const lastA = A.rows[A.rows.length - 1];
assert(A.rows.every(r => r.pop >= 4), 'A 闲置：人口不崩盘（软惩罚生效）');
assert(A.rows.some(r => r.hap < 50), 'A 闲置：幸福承压（闲置非优解）');
const lastB = B.rows[B.rows.length - 1];
assert(lastB.pop >= 40, `B 普通：8 年人口 ≥40（实际 ${lastB.pop}）`);
assert(lastB.hap >= 45, `B 普通：幸福 ≥45（实际 ${lastB.hap}）`);
assert(B.rows[B.rows.length - 1].silver > B.rows[1].silver * 0.5, `B 普通：白银不枯竭（期末 ${lastB.silver}）`);
const lastC = Cc.rows[Cc.rows.length - 1];
assert(lastC.pop >= 100, `C 优化：8 年人口 ≥100（实际 ${lastC.pop}）`);
assert(lastC.techs >= 4, `C 优化：科技 ≥4（实际 ${lastC.techs}）`);
assert(lastC.silver >= 600, `C 优化：白银 ≥600（实际 ${lastC.silver}）`);
assert(lastC.silver > Cc.rows[6].silver, `C 优化：白银持续上升（Y7 ${Cc.rows[6].silver} → Y9 ${lastC.silver}）`);
assert(Cc.rows.every(r => r.food > 0 || r.pop > 20), 'C 优化：无明显饥荒');

process.exit(fail ? 1 : 0);
