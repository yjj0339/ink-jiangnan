// 水墨风渲染器：宣纸底 + 地形缓存层 + 建筑矢量画 + 动态层
import * as C from './config.js';
import { idx, clamp, hash2, makeNoise, fbm } from './util.js';

const T = C.TERRAIN;
export const TILE = 44;

// 调色（低饱和水墨 + 朱红点睛）
const INK = '#3d3a34';
const PAPER = '#f6f1e3';

export class Renderer {
  constructor(canvas, map, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.game = game;
    this.cam = { x: map.spawn.x, y: map.spawn.y, z: 1.05 };
    this.ghost = null;       // {defId,x,y,ok}
    this.selectedUid = 0;
    this.hover = null;
    this.showGrid = false;
    this.time = 0;
    this.buildTerrainCache();
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.cw = w; this.ch = h;
  }

  // ---------- 坐标 ----------
  screenToTile(sx, sy) {
    const z = this.cam.z * TILE;
    return { x: (sx - this.cw / 2) / z + this.cam.x, y: (sy - this.ch / 2) / z + this.cam.y };
  }
  centerOn(tx, ty) { this.cam.x = tx; this.cam.y = ty; }
  zoomAt(sx, sy, factor) {
    const before = this.screenToTile(sx, sy);
    this.cam.z = clamp(this.cam.z * factor, 0.5, 2.4);
    const after = this.screenToTile(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }
  clampCam() {
    this.cam.x = clamp(this.cam.x, 2, this.map.W - 2);
    this.cam.y = clamp(this.cam.y, 2, this.map.H - 2);
  }
  fitView() { this.centerOn(this.map.W / 2, this.map.H / 2); this.cam.z = 0.85; }

  visibleRange() {
    const z = this.cam.z * TILE;
    const x0 = Math.floor(this.cam.x - this.cw / (2 * z)) - 1;
    const x1 = Math.ceil(this.cam.x + this.cw / (2 * z)) + 1;
    const y0 = Math.floor(this.cam.y - this.ch / (2 * z)) - 2;
    const y1 = Math.ceil(this.cam.y + this.ch / (2 * z)) + 2;
    return { x0: Math.max(0, x0), x1: Math.min(this.map.W - 1, x1), y0: Math.max(0, y0), y1: Math.min(this.map.H - 1, y1) };
  }

  // ---------- 地形缓存层 ----------
  buildTerrainCache() {
    const cv = document.createElement('canvas');
    cv.width = this.map.W * TILE; cv.height = this.map.H * TILE;
    const g = cv.getContext('2d');
    const rand = (i) => hash2(i % this.map.W, (i / this.map.W) | 0, this.map.seed);
    const nWash = makeNoise(this.map.seed + 211);   // 低频色晕，消除棋盘感

    for (let y = 0; y < this.map.H; y++) for (let x = 0; x < this.map.W; x++) {
      const i = idx(x, y, this.map.W);
      const t = this.map.terrain[i];
      const px = x * TILE, py = y * TILE;
      const r = rand(i);
      const wash = fbm(nWash, x * 0.18, y * 0.18, 3);   // 0..1 大块色晕
      // 底色（随色晕渐变）
      if (t === T.WATER) {
        g.fillStyle = r < 0.5 ? '#c3d6d4' : '#bdd2d2';
      } else if (t === T.FERTILE) {
        g.fillStyle = `hsl(50, ${34 + wash * 10}%, ${80 + wash * 5}%)`;
      } else if (t === T.ROCK) {
        g.fillStyle = `hsl(45, 8%, ${77 + wash * 5}%)`;
      } else if (t === T.ORE) {
        g.fillStyle = `hsl(45, 9%, ${73 + wash * 4}%)`;
      } else if (t === T.FOREST) {
        g.fillStyle = `hsl(78, ${20 + wash * 8}%, ${83 + wash * 4}%)`;
      } else {
        g.fillStyle = `hsl(68, ${20 + wash * 10}%, ${87 + wash * 5}%)`;
      }
      g.fillRect(px, py, TILE, TILE);

      // 质感斑点
      g.fillStyle = 'rgba(120,120,100,0.05)';
      for (let k = 0; k < 3; k++) {
        const rx = hash2(x * 7 + k, y * 13, this.map.seed) * TILE;
        const ry = hash2(x * 11, y * 5 + k, this.map.seed) * TILE;
        g.beginPath(); g.arc(px + rx, py + ry, 1.2 + hash2(k, x + y, 7) * 2, 0, 7); g.fill();
      }

      // 草叶笔触（稀疏，消解空旷感）
      if ((t === T.GRASS || t === T.FOREST) && r > 0.42) {
        g.strokeStyle = 'rgba(130,145,85,0.4)'; g.lineWidth = 1.1; g.lineCap = 'round';
        const n = r > 0.75 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const rx = px + 6 + hash2(x * 9 + k, y * 3, 41) * (TILE - 12);
          const ry = py + 6 + hash2(x * 3, y * 9 + k, 43) * (TILE - 12);
          g.beginPath();
          g.moveTo(rx, ry + 3);
          g.quadraticCurveTo(rx + 1.5, ry - 1, rx + (hash2(k, x, y) > 0.5 ? 3.5 : -1), ry - 4);
          g.stroke();
        }
      }

      if (t === T.FERTILE) { // 田埂纹理
        g.strokeStyle = 'rgba(140,130,80,0.18)'; g.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          g.beginPath(); g.moveTo(px + 3, py + k * TILE / 4); g.lineTo(px + TILE - 3, py + k * TILE / 4); g.stroke();
        }
      }
      if (t === T.ROCK) { // 岩石笔触
        g.strokeStyle = 'rgba(100,98,90,0.4)'; g.lineWidth = 1.6; g.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const rx = px + 8 + hash2(x + k, y, 3) * 24, ry = py + 8 + hash2(x, y + k, 5) * 24;
          g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + 6 + hash2(k, x, 9) * 6, ry + 3); g.stroke();
          g.beginPath(); g.arc(rx + 3, ry + 1, 2.5, 0, 7); g.fillStyle = 'rgba(110,105,95,0.25)'; g.fill();
        }
      }
      if (t === T.ORE) { // 矿石点
        for (let k = 0; k < 3; k++) {
          const rx = px + 8 + hash2(x * 3 + k, y, 11) * 28, ry = py + 8 + hash2(x, y * 3 + k, 13) * 28;
          g.fillStyle = 'rgba(72,66,58,0.75)';
          g.beginPath(); g.arc(rx, ry, 2.2, 0, 7); g.fill();
          g.fillStyle = 'rgba(200,190,160,0.5)';
          g.beginPath(); g.arc(rx - 0.7, ry - 0.7, 0.8, 0, 7); g.fill();
        }
      }
    }

    // 水陆交界描岸
    g.strokeStyle = 'rgba(90,110,110,0.5)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let y = 0; y < this.map.H; y++) for (let x = 0; x < this.map.W; x++) {
      const i = idx(x, y, this.map.W);
      if (this.map.terrain[i] !== T.WATER) continue;
      const px = x * TILE, py = y * TILE;
      if (x + 1 < this.map.W && this.map.terrain[i + 1] !== T.WATER) { g.beginPath(); g.moveTo(px + TILE, py); g.lineTo(px + TILE, py + TILE); g.stroke(); }
      if (x - 1 >= 0 && this.map.terrain[i - 1] !== T.WATER) { g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + TILE); g.stroke(); }
      if (y + 1 < this.map.H && this.map.terrain[i + this.map.W] !== T.WATER) { g.beginPath(); g.moveTo(px, py + TILE); g.lineTo(px + TILE, py + TILE); g.stroke(); }
      if (y - 1 >= 0 && this.map.terrain[i - this.map.W] !== T.WATER) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + TILE, py); g.stroke(); }
    }

    // 林木
    for (let y = 0; y < this.map.H; y++) for (let x = 0; x < this.map.W; x++) {
      const i = idx(x, y, this.map.W);
      if (this.map.terrain[i] !== T.FOREST) continue;
      const d = this.map.tree[i];
      const n = d > 0.75 ? 4 : d > 0.45 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const rx = px2(x) + 6 + hash2(x * 5 + k, y * 3, 21) * (TILE - 12);
        const ry = py2(y) + 6 + hash2(x * 3, y * 5 + k, 23) * (TILE - 12);
        drawTree(g, rx, ry, 5 + hash2(k, x + y, 27) * 4, hash2(k * 3, x * 7 + y, 29));
      }
    }
    function px2(x) { return x * TILE; }
    function py2(y) { return y * TILE; }

    // 宣纸纤维感
    g.fillStyle = 'rgba(90,80,60,0.035)';
    for (let k = 0; k < 2600; k++) {
      const rx = hash2(k, 1, 99) * cv.width, ry = hash2(1, k, 98) * cv.height;
      g.fillRect(rx, ry, 1 + hash2(k, 2, 97) * 2, 1);
    }

    this.terrainCanvas = cv;
  }

  // ---------- 每帧渲染 ----------
  render(dt) {
    this.time += dt;
    const g = this.ctx;
    const z = this.cam.z;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, this.cw, this.ch);
    g.setTransform(this.dpr * z, 0, 0, this.dpr * z,
      this.dpr * (this.cw / 2 - this.cam.x * TILE * z), this.dpr * (this.ch / 2 - this.cam.y * TILE * z));

    // 地形
    if (this.terrainCanvas) g.drawImage(this.terrainCanvas, 0, 0);

    const vis = this.visibleRange();

    // 水面波光
    this.drawWater(g, vis);
    // 道路
    this.drawRoads(g, vis);
    // 建筑（按 y 排序）
    const bs = this.game.buildings
      .filter(b => b.x + b.def.w >= vis.x0 && b.x <= vis.x1 && b.y + b.def.h >= vis.y0 && b.y <= vis.y1)
      .sort((a, b) => (a.y + a.def.h) - (b.y + b.def.h));
    for (const b of bs) this.drawBuilding(g, b);
    // 幽灵
    if (this.ghost) this.drawGhost(g);
    // 选中框
    if (this.selectedUid) {
      const b = this.game.buildings.find(o => o.uid === this.selectedUid);
      if (b) this.drawSelection(g, b);
    }
    // 网格
    if (this.showGrid) this.drawGridLines(g, vis);
  }

  drawWater(g, vis) {
    const t = this.time * 0.001;
    g.lineCap = 'round';
    for (const i of this.map.waterList) {
      const x = i % this.map.W, y = (i / this.map.W) | 0;
      if (x < vis.x0 || x > vis.x1 || y < vis.y0 || y > vis.y1) continue;
      const px = x * TILE, py = y * TILE;
      const ph = t * 1.4 + (x * 0.9 + y * 1.3);
      const ox = px + TILE * 0.5 + Math.sin(ph) * TILE * 0.18;
      const oy = py + TILE * (0.32 + 0.36 * hash2(x, y, 5));
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(ox - 7, oy);
      g.quadraticCurveTo(ox, oy - 2.2, ox + 7, oy);
      g.stroke();
      if (hash2(x, y, 9) > 0.6) {
        g.strokeStyle = 'rgba(80,115,120,0.28)';
        g.beginPath();
        g.moveTo(ox - 4, oy + 4);
        g.quadraticCurveTo(ox + 3, oy + 2.4, ox + 9, oy + 4.4);
        g.stroke();
      }
    }
  }

  drawRoads(g, vis) {
    const roads = this.game.roads;
    const occ = this.game.occ;
    g.lineCap = 'round';
    // 桥先画（路面会盖上来）
    for (const i of roads) {
      const x = i % this.map.W, y = (i / this.map.W) | 0;
      if (x < vis.x0 - 1 || x > vis.x1 + 1 || y < vis.y0 - 1 || y > vis.y1 + 1) continue;
      if (this.map.terrain[i] !== T.WATER) continue;
      const px = x * TILE, py = y * TILE;
      const horiz = this.isRoadOrBridge(x - 1, y) || this.isRoadOrBridge(x + 1, y);
      g.fillStyle = '#c9b08a';
      if (horiz) g.fillRect(px, py + TILE * 0.22, TILE, TILE * 0.56);
      else g.fillRect(px + TILE * 0.22, py, TILE * 0.56, TILE);
      g.strokeStyle = 'rgba(90,70,45,0.7)'; g.lineWidth = 1.2;
      if (horiz) {
        g.strokeRect(px, py + TILE * 0.22, TILE, TILE * 0.56);
        for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(px + k * TILE / 4, py + TILE * 0.22); g.lineTo(px + k * TILE / 4, py + TILE * 0.78); g.stroke(); }
      } else {
        g.strokeRect(px + TILE * 0.22, py, TILE * 0.56, TILE);
        for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(px + TILE * 0.22, py + k * TILE / 4); g.lineTo(px + TILE * 0.78, py + k * TILE / 4); g.stroke(); }
      }
    }
    // 土路面
    for (const i of roads) {
      const x = i % this.map.W, y = (i / this.map.W) | 0;
      if (x < vis.x0 - 1 || x > vis.x1 + 1 || y < vis.y0 - 1 || y > vis.y1 + 1) continue;
      if (this.map.terrain[i] === T.WATER) continue;
      const px = x * TILE, py = y * TILE;
      const cx = px + TILE / 2, cy = py + TILE / 2;
      g.strokeStyle = '#b3a184'; g.lineWidth = TILE * 0.24;
      g.beginPath(); g.arc(cx, cy, TILE * 0.02, 0, 7); g.stroke();
      const LINK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of LINK) {
        const j = idx(x + dx, y + dy, this.map.W);
        if (!roads.has(j)) continue;
        if (this.map.terrain[j] === T.WATER && !(occ[j] && this.game.buildings.find(b => b.uid === occ[j] && b.def.bridge))) continue;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + dx * TILE, cy + dy * TILE);
        g.stroke();
      }
      g.strokeStyle = 'rgba(255,252,240,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, TILE * 0.05, 0, 7); g.stroke();
    }
  }

  isRoadOrBridge(x, y) {
    if (x < 0 || y < 0 || x >= this.map.W || y >= this.map.H) return false;
    return this.game.roads.has(idx(x, y, this.map.W));
  }

  // ---------- 建筑 ----------
  drawBuilding(g, b) {
    const px = b.x * TILE, py = b.y * TILE;
    const w = b.def.w * TILE, h = b.def.h * TILE;
    const art = ART[b.defId] || ART.house;
    g.save();
    if (b.damaged) { g.filter = 'grayscale(0.8)'; }
    art(g, px, py, w, h, b, this);
    g.restore();
    if (b.damaged) { // 焦痕与残烟
      g.fillStyle = 'rgba(60,50,40,0.25)';
      g.fillRect(px + w * 0.15, py + h * 0.3, w * 0.7, h * 0.5);
      const t = this.time * 0.001;
      g.fillStyle = 'rgba(120,115,110,0.35)';
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.5 + k * 0.33) % 1;
        g.beginPath();
        g.arc(px + w * 0.5 + Math.sin(ph * 6 + k) * 4, py + h * 0.35 - ph * 26, 3 + ph * 4, 0, 7);
        g.fill();
      }
    } else if (b.def.workers > 0 && b.eff <= 0 && this.game.functional(b)) {
      // 缺人提示
      const t = this.time * 0.002;
      g.fillStyle = 'rgba(160,70,50,0.85)';
      g.font = `bold ${Math.round(11 * this.cam.z)}px serif`;
      g.textAlign = 'center';
      g.fillText('缺人', px + w / 2, py - 4 + Math.sin(t) * 1.5);
    }
  }

  drawGhost(g) {
    const gh = this.ghost;
    const def = C.B[gh.defId];
    const px = gh.x * TILE, py = gh.y * TILE;
    const w = def.w * TILE, h = def.h * TILE;
    g.globalAlpha = 0.55;
    const art = ART[gh.defId] || ART.house;
    art(g, px, py, w, h, { def, tier: 0 }, this);
    g.globalAlpha = 1;
    g.fillStyle = gh.ok ? 'rgba(120,160,90,0.18)' : 'rgba(190,80,60,0.2)';
    g.fillRect(px, py, w, h);
    g.strokeStyle = gh.ok ? 'rgba(90,130,60,0.9)' : 'rgba(170,60,45,0.9)';
    g.lineWidth = 2;
    g.strokeRect(px + 1, py + 1, w - 2, h - 2);
    if (def.service) { // 服务半径圈
      g.strokeStyle = 'rgba(160,80,60,0.45)';
      g.setLineDash([6, 5]);
      g.beginPath();
      g.arc(px + w / 2, py + h / 2, (def.service.radius + def.w / 2) * TILE, 0, 7);
      g.stroke();
      g.setLineDash([]);
    }
  }

  drawSelection(g, b) {
    const px = b.x * TILE, py = b.y * TILE;
    const w = b.def.w * TILE, h = b.def.h * TILE;
    g.strokeStyle = '#a8402e'; g.lineWidth = 2.2; g.lineCap = 'round';
    const L = Math.min(w, h) * 0.3;
    const corners = [[px, py, 1, 1], [px + w, py, -1, 1], [px, py + h, 1, -1], [px + w, py + h, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      g.beginPath(); g.moveTo(cx + sx * L, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * L); g.stroke();
    }
  }

  drawGridLines(g, vis) {
    g.strokeStyle = 'rgba(80,80,70,0.12)'; g.lineWidth = 0.6;
    for (let x = vis.x0; x <= vis.x1 + 1; x++) { g.beginPath(); g.moveTo(x * TILE, vis.y0 * TILE); g.lineTo(x * TILE, (vis.y1 + 1) * TILE); g.stroke(); }
    for (let y = vis.y0; y <= vis.y1 + 1; y++) { g.beginPath(); g.moveTo(vis.x0 * TILE, y * TILE); g.lineTo((vis.x1 + 1) * TILE, y * TILE); g.stroke(); }
  }
}

// ---------- 素材小件 ----------
function drawTree(g, x, y, r, tone) {
  g.strokeStyle = 'rgba(80,62,44,0.75)'; g.lineWidth = 1.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y + r * 0.8); g.lineTo(x, y); g.stroke();
  const greens = [['#7e9464', 'rgba(110,130,80,0.28)'], ['#6d8659', 'rgba(95,120,72,0.3)'], ['#8aa072', 'rgba(125,145,95,0.26)']];
  const [c1, c2] = greens[Math.floor(tone * 3) % 3];
  g.fillStyle = c2;
  g.beginPath(); g.ellipse(x, y - r * 0.15, r * 1.15, r * 0.95, 0, 0, 7); g.fill();
  g.fillStyle = c1;
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.55, 0, 7); g.fill();
  g.beginPath(); g.arc(x + r * 0.4, y - r * 0.2, r * 0.45, 0, 7); g.fill();
}

// 白墙 + 瓦屋顶（正向视图，带微透视感）
function houseBase(g, x, y, w, h, opts = {}) {
  const roofH = h * (opts.roofH || 0.42);
  const wallY = y + roofH * 0.55;
  const wallH = y + h - wallY;
  // 墙
  g.fillStyle = opts.wall || '#f3ecda';
  g.strokeStyle = 'rgba(70,65,55,0.75)'; g.lineWidth = 1.3;
  g.beginPath(); g.rect(x + w * 0.12, wallY, w * 0.76, wallH); g.fill(); g.stroke();
  // 门
  g.fillStyle = '#6b5844';
  g.fillRect(x + w * 0.42, y + h - wallH * 0.52, w * 0.16, wallH * 0.52);
  // 窗
  g.strokeStyle = 'rgba(70,60,50,0.8)'; g.lineWidth = 1;
  if (opts.win !== false) {
    g.strokeRect(x + w * 0.2, wallY + wallH * 0.22, w * 0.12, wallH * 0.3);
    g.strokeRect(x + w * 0.68, wallY + wallH * 0.22, w * 0.12, wallH * 0.3);
  }
  // 屋顶（悬山微翘）
  const ry = y + roofH * 0.62;
  const over = w * 0.1;
  g.fillStyle = opts.roof || '#5c6066';
  g.beginPath();
  g.moveTo(x - over * 0.4, ry + roofH * 0.38);
  g.quadraticCurveTo(x + w * 0.5, ry - roofH * 0.55, x + w + over * 0.4, ry + roofH * 0.38);
  g.lineTo(x + w + over * 0.55, ry + roofH * 0.52);
  g.quadraticCurveTo(x + w * 0.5, ry + roofH * 0.05, x - over * 0.55, ry + roofH * 0.52);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(50,48,44,0.8)'; g.lineWidth = 1.2; g.stroke();
  // 脊
  g.strokeStyle = 'rgba(45,44,40,0.9)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + w * 0.08, ry - roofH * 0.18);
  g.quadraticCurveTo(x + w * 0.5, ry - roofH * 0.34, x + w * 0.92, ry - roofH * 0.18);
  g.stroke();
  return { wallY, wallH };
}

// 茅草顶
function thatchRoof(g, x, y, w, h) {
  const roofH = h * 0.46;
  const ry = y + roofH * 0.6;
  g.fillStyle = '#c2a468';
  g.beginPath();
  g.moveTo(x - w * 0.05, ry + roofH * 0.4);
  g.quadraticCurveTo(x + w * 0.5, ry - roofH * 0.6, x + w * 1.05, ry + roofH * 0.4);
  g.lineTo(x + w * 1.08, ry + roofH * 0.55);
  g.quadraticCurveTo(x + w * 0.5, ry + roofH * 0.05, x - w * 0.08, ry + roofH * 0.55);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(120,95,55,0.85)'; g.lineWidth = 1.1;
  for (let k = 0; k < 5; k++) {
    const t = k / 4;
    g.beginPath();
    g.moveTo(x + w * (0.08 + t * 0.84), ry - roofH * 0.28);
    g.quadraticCurveTo(x + w * (0.1 + t * 0.8), ry + roofH * 0.12, x + w * (0.06 + t * 0.88), ry + roofH * 0.46);
    g.stroke();
  }
  g.strokeStyle = 'rgba(90,70,40,0.9)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x + w * 0.1, ry - roofH * 0.2);
  g.quadraticCurveTo(x + w * 0.5, ry - roofH * 0.38, x + w * 0.9, ry - roofH * 0.2);
  g.stroke();
}

function banner(g, x, y, ch, bg = '#a8402e') { // 幌子
  g.strokeStyle = 'rgba(70,60,50,0.8)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 16); g.stroke();
  g.fillStyle = bg;
  g.fillRect(x, y - 16, 12, 15);
  g.fillStyle = '#f6f1e3';
  g.font = 'bold 10px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, x + 6, y - 8);
  g.textBaseline = 'alphabetic';
}

function smoke(g, x, y, seed, time) {
  const t = (time * 0.00035 + seed) % 1;
  g.fillStyle = `rgba(130,125,118,${0.3 * (1 - t)})`;
  g.beginPath();
  g.arc(x + Math.sin(t * 5 + seed * 9) * 5, y - t * 30, 2.5 + t * 5, 0, 7);
  g.fill();
}

// ---------- 各建筑画法 ----------
const ART = {
  house(g, x, y, w, h, b) { houseBase(g, x, y, w, h, {}); },

  hut(g, x, y, w, h, b, R) {
    const tier = b.tier || 0;
    if (tier === 0) {
      houseBase(g, x, y, w, h, { roofH: 0.5 });
      thatchRoof(g, x, y, w, h);
    } else if (tier === 1) {
      houseBase(g, x, y, w, h, { roof: '#6a7076' });
    } else {
      // 楼阁：两层
      houseBase(g, x + w * 0.06, y + h * 0.28, w * 0.88, h * 0.72, { roof: '#565b62', roofH: 0.5 });
      houseBase(g, x, y, w, h * 0.5, { roof: '#565b62', roofH: 0.6, win: false });
    }
  },

  farm(g, x, y, w, h, b, R) {
    // 田垄
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) {
      const i = idx(b.x + tx, b.y + ty, R.map.W);
      const fert = R.map.terrain[i] === T.FERTILE;
      const cx = x + tx * TILE, cy = y + ty * TILE;
      g.fillStyle = fert ? 'rgba(160,150,70,0.35)' : 'rgba(150,150,120,0.15)';
      g.fillRect(cx + 2, cy + 2, TILE - 4, TILE - 4);
      if (fert) {
        g.strokeStyle = 'rgba(110,120,60,0.8)'; g.lineWidth = 1.6; g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const gy = cy + 10 + k * 11;
          g.beginPath(); g.moveTo(cx + 4, gy); g.quadraticCurveTo(cx + TILE / 2, gy - 4, cx + TILE - 4, gy); g.stroke();
        }
        // 禾苗点
        g.fillStyle = 'rgba(105,125,60,0.75)';
        for (let k = 0; k < 4; k++) {
          g.beginPath(); g.arc(cx + 8 + hash2(tx * 3 + k, ty, 31) * (TILE - 16), cy + 9 + hash2(tx, ty * 3 + k, 33) * (TILE - 18), 1.6, 0, 7); g.fill();
        }
      }
    }
    // 田头小棚
    g.fillStyle = '#c2a468';
    g.beginPath();
    g.moveTo(x + w * 0.36, y - 2);
    g.lineTo(x + w * 0.5, y - 10);
    g.lineTo(x + w * 0.64, y - 2);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,95,55,0.8)'; g.lineWidth = 1; g.stroke();
  },

  lumber(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.05, y + h * 0.18, w * 0.55, h * 0.72, { roof: '#7a6a50', roofH: 0.5 });
    // 木堆
    for (let k = 0; k < 3; k++) {
      const cx = x + w * 0.72 + (k % 2) * 8, cy = y + h * 0.62 + Math.floor(k / 2) * 9;
      g.fillStyle = '#b08d5e';
      g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
      g.strokeStyle = 'rgba(110,85,55,0.9)'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.stroke();
      g.beginPath(); g.arc(cx, cy, 2, 0, 7); g.stroke();
    }
    // 伐木桩
    g.fillStyle = '#9c7d52';
    g.fillRect(x + w * 0.2, y + h * 0.02, 6, 8);
  },

  quarry(g, x, y, w, h) {
    g.fillStyle = 'rgba(130,126,115,0.5)';
    g.beginPath();
    g.moveTo(x + w * 0.1, y + h * 0.75);
    g.lineTo(x + w * 0.35, y + h * 0.2);
    g.lineTo(x + w * 0.6, y + h * 0.55);
    g.lineTo(x + w * 0.85, y + h * 0.15);
    g.lineTo(x + w * 0.95, y + h * 0.75);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(90,88,80,0.8)'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = '#a9a498';
    for (const [rx, ry, r] of [[0.25, 0.85, 6], [0.45, 0.9, 7], [0.65, 0.86, 5]]) {
      g.beginPath(); g.arc(x + w * rx, y + h * ry, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(85,82,74,0.7)'; g.lineWidth = 1; g.stroke();
    }
    // 镐
    g.strokeStyle = '#7c6248'; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + w * 0.75, y + h * 0.5); g.lineTo(x + w * 0.88, y + h * 0.28); g.stroke();
  },

  mine(g, x, y, w, h) {
    // 矿洞
    g.fillStyle = '#8d8778';
    g.beginPath();
    g.moveTo(x + w * 0.2, y + h * 0.8);
    g.lineTo(x + w * 0.2, y + h * 0.42);
    g.quadraticCurveTo(x + w * 0.42, y + h * 0.12, x + w * 0.64, y + h * 0.42);
    g.lineTo(x + w * 0.64, y + h * 0.8);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,66,58,0.85)'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = '#3a362f';
    g.beginPath();
    g.moveTo(x + w * 0.28, y + h * 0.8);
    g.lineTo(x + w * 0.28, y + h * 0.5);
    g.quadraticCurveTo(x + w * 0.42, y + h * 0.3, x + w * 0.56, y + h * 0.5);
    g.lineTo(x + w * 0.56, y + h * 0.8);
    g.closePath(); g.fill();
    // 矿车轨道 + 矿堆
    g.strokeStyle = '#6e5b42'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.92); g.lineTo(x + w * 0.9, y + h * 0.92); g.stroke();
    g.fillStyle = '#4c463c';
    g.beginPath(); g.arc(x + w * 0.82, y + h * 0.82, 6, 0, 7); g.fill();
  },

  carpenter(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.06, y + h * 0.2, w * 0.88, h * 0.7, { roof: '#8a6a44', roofH: 0.48 });
    // 木料架
    g.strokeStyle = '#7c6248'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + w * 0.12, y + h * 0.95); g.lineTo(x + w * 0.12, y + h * 0.62); g.lineTo(x + w * 0.5, y + h * 0.62); g.stroke();
    g.fillStyle = '#b08d5e';
    g.fillRect(x + w * 0.16, y + h * 0.66, w * 0.3, 4);
    g.fillRect(x + w * 0.16, y + h * 0.76, w * 0.3, 4);
    smoke(g, x + w * 0.78, y + h * 0.24, 0.3, R.time);
  },

  kiln(g, x, y, w, h, b, R) {
    // 拱窑
    g.fillStyle = '#9c8f7c';
    g.beginPath();
    g.moveTo(x + w * 0.15, y + h * 0.88);
    g.lineTo(x + w * 0.15, y + h * 0.45);
    g.quadraticCurveTo(x + w * 0.5, y + h * 0.02, x + w * 0.85, y + h * 0.45);
    g.lineTo(x + w * 0.85, y + h * 0.88);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(75,68,58,0.85)'; g.lineWidth = 1.5; g.stroke();
    // 窑口火光
    g.fillStyle = '#3a332b';
    g.beginPath(); g.arc(x + w * 0.5, y + h * 0.72, w * 0.14, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(200,110,50,0.75)';
    g.beginPath(); g.arc(x + w * 0.5, y + h * 0.74, w * 0.08, Math.PI, 0); g.fill();
    // 烟
    for (let k = 0; k < 2; k++) smoke(g, x + w * 0.5, y + h * 0.12, k * 0.5 + 0.2, R.time);
  },

  papermill(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.6, { roof: '#746a58', roofH: 0.5 });
    // 晾纸架
    g.strokeStyle = '#8a7a5c'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + w * 0.08, y + h * 0.3); g.lineTo(x + w * 0.92, y + h * 0.3); g.stroke();
    g.fillStyle = '#f9f5e8';
    g.strokeStyle = 'rgba(120,110,90,0.6)'; g.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) {
      g.fillRect(x + w * (0.14 + k * 0.19), y + h * 0.08, w * 0.12, h * 0.2);
      g.strokeRect(x + w * (0.14 + k * 0.19), y + h * 0.08, w * 0.12, h * 0.2);
    }
  },

  granary(g, x, y, w, h) {
    // 圆顶谷仓
    const cx = x + w / 2, cy = y + h * 0.72, r = w * 0.34;
    g.fillStyle = '#d9c491';
    g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.lineTo(cx + r, cy + h * 0.1); g.lineTo(cx - r, cy + h * 0.1); g.closePath();
    g.fill(); g.strokeStyle = 'rgba(110,90,55,0.85)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(140,115,70,0.7)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) {
      g.beginPath(); g.arc(cx, cy + h * 0.02, r * (1 - k * 0.16), Math.PI, 0); g.stroke();
    }
    g.fillStyle = '#8a7048';
    g.fillRect(cx - w * 0.07, cy - h * 0.02, w * 0.14, h * 0.12);
  },

  warehouse(g, x, y, w, h) {
    houseBase(g, x + w * 0.05, y + h * 0.15, w * 0.9, h * 0.8, { roof: '#4f565c', roofH: 0.4 });
    // 门板条
    g.strokeStyle = 'rgba(90,80,65,0.8)'; g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(x + w * (0.4 + k * 0.07), y + h * 0.62);
      g.lineTo(x + w * (0.4 + k * 0.07), y + h * 0.92);
      g.stroke();
    }
  },

  market(g, x, y, w, h, b, R) {
    // 大棚架
    g.fillStyle = 'rgba(178,120,80,0.25)';
    g.fillRect(x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.55);
    g.strokeStyle = '#8a6a48'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (const [rx, ry] of [[0.12, 0.35], [0.88, 0.35], [0.12, 0.85], [0.88, 0.85]]) {
      g.beginPath(); g.moveTo(x + w * rx, y + h * ry); g.lineTo(x + w * rx, y + h * (ry + 0.12)); g.stroke();
    }
    // 顶棚布条
    const cols = ['#a8402e', '#c08a3e', '#5f7f6a', '#a8402e', '#c08a3e', '#5f7f6a'];
    for (let k = 0; k < 6; k++) {
      g.fillStyle = cols[k];
      g.fillRect(x + w * (0.08 + k * 0.14), y + h * 0.22, w * 0.13, h * 0.1);
    }
    g.strokeStyle = 'rgba(90,70,48,0.9)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x + w * 0.04, y + h * 0.32); g.lineTo(x + w * 0.96, y + h * 0.32); g.stroke();
    // 摊位
    g.fillStyle = '#c9a86a';
    g.fillRect(x + w * 0.2, y + h * 0.55, w * 0.24, h * 0.2);
    g.fillRect(x + w * 0.56, y + h * 0.55, w * 0.24, h * 0.2);
    g.fillStyle = '#a8402e';
    g.beginPath(); g.arc(x + w * 0.32, y + h * 0.52, 3, 0, 7); g.fill();
    g.fillStyle = '#5f7f6a';
    g.beginPath(); g.arc(x + w * 0.68, y + h * 0.52, 3, 0, 7); g.fill();
  },

  well(g, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2;
    g.fillStyle = '#b8b2a4';
    g.beginPath(); g.arc(cx, cy, w * 0.3, 0, 7); g.fill();
    g.strokeStyle = 'rgba(80,76,68,0.85)'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = '#42504f';
    g.beginPath(); g.arc(cx, cy, w * 0.18, 0, 7); g.fill();
    // 辘轳架
    g.strokeStyle = '#7c6248'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - w * 0.3, cy - w * 0.05); g.lineTo(cx - w * 0.1, cy - w * 0.45); g.lineTo(cx + w * 0.1, cy - w * 0.45); g.lineTo(cx + w * 0.3, cy - w * 0.05); g.stroke();
  },

  watchtower(g, x, y, w, h) {
    const cx = x + w / 2;
    g.fillStyle = '#c7b691';
    g.fillRect(cx - w * 0.16, y + h * 0.25, w * 0.32, h * 0.6);
    g.strokeStyle = 'rgba(90,80,60,0.85)'; g.lineWidth = 1.3;
    g.strokeRect(cx - w * 0.16, y + h * 0.25, w * 0.32, h * 0.6);
    g.fillStyle = '#565b62';
    g.beginPath();
    g.moveTo(cx - w * 0.34, y + h * 0.3);
    g.lineTo(cx, y + h * 0.02);
    g.lineTo(cx + w * 0.34, y + h * 0.3);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(90,80,60,0.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - w * 0.22, y + h * 0.62); g.lineTo(cx + w * 0.22, y + h * 0.62); g.stroke();
  },

  teahouse(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.06, y + h * 0.22, w * 0.88, h * 0.72, { roof: '#5f6b62', roofH: 0.46 });
    banner(g, x + w * 0.86, y + h * 0.5, '茶');
    smoke(g, x + w * 0.3, y + h * 0.16, 0.1, R.time);
  },

  clinic(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.06, y + h * 0.22, w * 0.88, h * 0.72, { roof: '#4e6066', roofH: 0.46 });
    // 药葫芦幌
    const bx = x + w * 0.86, by = y + h * 0.52;
    g.strokeStyle = 'rgba(70,60,50,0.8)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx, by - 14); g.stroke();
    g.fillStyle = '#8a6a3e';
    g.beginPath(); g.arc(bx + 6, by - 8, 4.5, 0, 7); g.fill();
    g.beginPath(); g.arc(bx + 6, by - 14, 3, 0, 7); g.fill();
  },

  stage(g, x, y, w, h) {
    // 台基
    g.fillStyle = '#cfc4a8';
    g.fillRect(x + w * 0.08, y + h * 0.5, w * 0.84, h * 0.4);
    g.strokeStyle = 'rgba(90,80,60,0.85)'; g.lineWidth = 1.4;
    g.strokeRect(x + w * 0.08, y + h * 0.5, w * 0.84, h * 0.4);
    // 柱
    g.fillStyle = '#96402e';
    g.fillRect(x + w * 0.16, y + h * 0.3, 5, h * 0.42);
    g.fillRect(x + w * 0.8, y + h * 0.3, 5, h * 0.42);
    // 飞檐大顶
    g.fillStyle = '#48505a';
    g.beginPath();
    g.moveTo(x - w * 0.02, y + h * 0.38);
    g.quadraticCurveTo(x + w * 0.14, y + h * 0.12, x - w * 0.06, y + h * 0.02);
    g.quadraticCurveTo(x + w * 0.5, y - h * 0.16, x + w * 1.06, y + h * 0.02);
    g.quadraticCurveTo(x + w * 0.86, y + h * 0.12, x + w * 1.02, y + h * 0.38);
    g.quadraticCurveTo(x + w * 0.5, y + h * 0.2, x - w * 0.02, y + h * 0.38);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(45,48,52,0.9)'; g.lineWidth = 1.5; g.stroke();
    // 脊饰
    g.fillStyle = '#a8402e';
    g.beginPath(); g.arc(x + w * 0.5, y - h * 0.1, 3, 0, 7); g.fill();
  },

  temple(g, x, y, w, h, b, R) {
    // 大殿
    g.fillStyle = '#cfc4a8';
    g.fillRect(x + w * 0.1, y + h * 0.45, w * 0.8, h * 0.45);
    g.strokeStyle = 'rgba(90,80,60,0.85)'; g.lineWidth = 1.4;
    g.strokeRect(x + w * 0.1, y + h * 0.45, w * 0.8, h * 0.45);
    g.fillStyle = '#96402e';
    g.fillRect(x + w * 0.2, y + h * 0.5, 5, h * 0.36);
    g.fillRect(x + w * 0.76, y + h * 0.5, 5, h * 0.36);
    g.fillStyle = '#48505a';
    g.beginPath();
    g.moveTo(x, y + h * 0.48);
    g.quadraticCurveTo(x + w * 0.5, y + h * 0.12, x + w, y + h * 0.48);
    g.quadraticCurveTo(x + w * 0.5, y + h * 0.3, x, y + h * 0.48);
    g.closePath(); g.fill(); g.stroke();
    // 香炉与青烟
    g.fillStyle = '#6e6a60';
    g.beginPath(); g.arc(x + w * 0.5, y + h * 0.9, 6, 0, 7); g.fill();
    for (let k = 0; k < 2; k++) smoke(g, x + w * 0.5, y + h * 0.8, k * 0.4 + 0.1, R.time);
  },

  tradehouse(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.06, y + h * 0.22, w * 0.88, h * 0.72, { roof: '#6b5a48', roofH: 0.46 });
    banner(g, x + w * 0.86, y + h * 0.5, '商', '#3d5a66');
    // 算盘珠? 银锭
    g.fillStyle = '#d8d3c5';
    g.beginPath(); g.ellipse(x + w * 0.3, y + h * 0.86, 6, 3, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(110,105,90,0.8)'; g.lineWidth = 1; g.stroke();
  },

  dock(g, x, y, w, h, b, R) {
    // 栈桥
    g.fillStyle = '#b08d5e';
    g.fillRect(x + w * 0.1, y + h * 0.55, w * 0.8, h * 0.2);
    g.strokeStyle = 'rgba(110,85,55,0.9)'; g.lineWidth = 1.2;
    g.strokeRect(x + w * 0.1, y + h * 0.55, w * 0.8, h * 0.2);
    for (let k = 1; k < 5; k++) {
      g.beginPath(); g.moveTo(x + w * (0.1 + k * 0.16), y + h * 0.55); g.lineTo(x + w * (0.1 + k * 0.16), y + h * 0.75); g.stroke();
    }
    // 小屋
    houseBase(g, x + w * 0.08, y + h * 0.05, w * 0.5, h * 0.55, { roof: '#5a6260', roofH: 0.5 });
    // 系缆桩
    g.fillStyle = '#6e5b42';
    g.fillRect(x + w * 0.82, y + h * 0.5, 4, 8);
  },

  academy(g, x, y, w, h, b, R) {
    houseBase(g, x + w * 0.08, y + h * 0.3, w * 0.84, h * 0.62, { roof: '#3f4c56', roofH: 0.5 });
    // 牌匾
    g.fillStyle = '#5a4632';
    g.fillRect(x + w * 0.36, y + h * 0.42, w * 0.28, h * 0.14);
    g.fillStyle = '#f0e8d2';
    g.font = `bold ${Math.round(w * 0.1)}px serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('書院', x + w * 0.5, y + h * 0.5);
    g.textBaseline = 'alphabetic';
    // 老树
    drawTree(g, x + w * 0.12, y + h * 0.4, 9, 0.4);
  },

  road(g, x, y, w, h) {},  // 路面单独画

  bridge(g, x, y, w, h) {}, // 桥单独画
};
