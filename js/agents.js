// 点景动画：行人（沿路网 BFS）+ 河船 + 四季粒子 + 焰火
import { idx } from './util.js';
import { TILE } from './render.js';
import { bus } from './game.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Agents {
  constructor(game, renderer) {
    this.game = game;
    this.R = renderer;
    this.walkers = [];
    this.boats = [];
    this.particles = [];
    this.rocket = null;
    this.spawnT = 0;
    bus.addEventListener('fireworks', () => { this.launchFireworks(); });
  }

  // ---------- 路网寻路 ----------
  bfsRoad(from, to) {
    if (from === to) return [from];
    const W = this.game.map.W;
    const prev = new Map([[from, -1]]);
    let q = [from];
    while (q.length) {
      const nq = [];
      for (const i of q) {
        const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of DIRS4) {
          const j = idx(x + dx, y + dy, W);
          if (!this.game.roads.has(j) || prev.has(j)) continue;
          prev.set(j, i);
          if (j === to) {
            const path = [to];
            let cur = to;
            while (prev.get(cur) !== -1) { cur = prev.get(cur); path.push(cur); }
            return path.reverse();
          }
          nq.push(j);
        }
      }
      q = nq;
    }
    return null;
  }

  randomRoadTile() {
    const arr = [...this.game.roads];
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  spawnWalker() {
    const a = this.randomRoadTile(), b = this.randomRoadTile();
    if (a == null || b == null) return;
    const path = this.bfsRoad(a, b);
    if (!path || path.length < 3) return;
    this.walkers.push({
      path, seg: 0, t: 0,
      speed: 0.9 + Math.random() * 0.7,   // 瓦片/秒
      hue: Math.random(),
    });
  }

  // ---------- 更新 ----------
  update(dt) {
    const g = this.game;
    // 行人数量随人口
    const want = Math.round(Math.min(30, Math.max(0, g.pop / 5)));
    this.spawnT -= dt;
    if (this.walkers.length < want && this.spawnT <= 0) {
      this.spawnWalker();
      this.spawnT = 0.4;
    }
    for (const w of this.walkers) {
      w.t += dt * w.speed;
      while (w.t >= 1) {
        w.t -= 1; w.seg++;
        if (w.seg >= w.path.length - 1) { w.dead = true; break; }
      }
    }
    this.walkers = this.walkers.filter(w => !w.dead);

    // 船：有码头时
    const hasDock = g.buildings.some(b => b.defId === 'dock' && !b.damaged);
    if (hasDock && this.boats.length < 2 && Math.random() < dt * 0.2) this.spawnBoat();
    if (!hasDock) this.boats.length = 0;
    for (const bt of this.boats) {
      bt.t += dt * 0.25;
      if (bt.t >= 1) { bt.t = 0; bt.dead = true; }
    }
    this.boats = this.boats.filter(b => !b.dead);

    // 季节粒子
    this.updateSeasonParticles(dt);

    // 焰火
    if (this.rocket) this.updateFireworks(dt);
  }

  spawnBoat() {
    const g = this.game;
    const dock = g.buildings.find(b => b.defId === 'dock' && !b.damaged);
    if (!dock) return;
    // 从码头邻水格 BFS 到远处水格
    const W = g.map.W;
    let start = -1;
    outer:
    for (let dy = -1; dy <= dock.def.h; dy++) for (let dx = -1; dx <= dock.def.w; dx++) {
      const nx = dock.x + dx, ny = dock.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= g.map.H) continue;
      if (g.map.terrain[idx(nx, ny, W)] === 1) { start = idx(nx, ny, W); break outer; }
    }
    if (start < 0) return;
    const prev = new Map([[start, -1]]);
    let q = [start], far = start, depth = new Map([[start, 0]]);
    while (q.length) {
      const nq = [];
      for (const i of q) {
        const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of DIRS4) {
          const j = idx(x + dx, y + dy, W);
          if (prev.has(j)) continue;
          if (g.map.terrain[j] !== 1) continue;
          prev.set(j, i); depth.set(j, depth.get(i) + 1);
          if (depth.get(j) > depth.get(far)) far = j;
          nq.push(j);
        }
      }
      q = nq;
    }
    if (far === start) return;
    const path = [far];
    let cur = far;
    while (prev.get(cur) !== -1) { cur = prev.get(cur); path.push(cur); }
    path.reverse();
    if (path.length < 4) return;
    this.boats.push({ path, seg: 0, t: 0 });
  }

  updateSeasonParticles(dt) {
    const season = this.game.season;
    const conf = [
      { n: 0.9,  col: 'rgba(232,180,190,0.85)' },  // 春·花瓣
      { n: 0.5,  col: 'rgba(240,240,225,0.8)' },   // 夏·柳絮
      { n: 1.1,  col: 'rgba(205,150,70,0.85)' },   // 秋·落叶
      { n: 1.6,  col: 'rgba(250,250,255,0.9)' },   // 冬·雪
    ][season];
    if (Math.random() < dt * conf.n * 6) {
      const R = this.R;
      const x = (R.cam.x + (Math.random() - 0.5) * R.cw / (R.cam.z * TILE)) * TILE;
      const y = (R.cam.y - R.ch / (2 * R.cam.z * TILE) - 1) * TILE;
      this.particles.push({
        x, y, vx: 6 + Math.random() * 10, vy: 14 + Math.random() * 16,
        life: 1, decay: 0.05, col: conf.col,
        size: season === 3 ? 1.5 + Math.random() * 1.5 : 2 + Math.random() * 2,
        spin: Math.random() * 6, season,
      });
    }
    for (const p of this.particles) {
      p.x += p.vx * dt * (1 + Math.sin(p.spin + p.y * 0.01) * 0.6);
      p.y += p.vy * dt;
      p.life -= p.decay * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > 160) this.particles.splice(0, this.particles.length - 160);
  }

  launchFireworks() {
    const g = this.game;
    const bs = g.buildings.filter(b => !b.def.road && !b.def.bridge);
    if (!bs.length) return;
    const b = bs[Math.floor(Math.random() * bs.length)];
    this.rocket = {
      x: (b.x + b.def.w / 2) * TILE, y: (b.y) * TILE,
      vy: -120, burstT: 1.1, dots: null,
      col: ['#b8503c', '#c99a3f', '#5f7f6a', '#4f7f8b'][Math.floor(Math.random() * 4)],
    };
  }

  updateFireworks(dt) {
    const r = this.rocket;
    if (r.dots) {
      r.burstT -= dt;
      for (const d of r.dots) {
        d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 40 * dt; d.life -= dt * 0.7;
      }
      if (r.burstT <= -1.5) this.rocket = null;
      return;
    }
    r.y += r.vy * dt;
    r.vy += 60 * dt;
    r.burstT -= dt;
    if (r.burstT <= 0) {
      r.dots = [];
      const n = 26;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const sp = 60 + Math.random() * 30;
        r.dots.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
      }
      r.burstT = 1.2;
    }
  }

  // ---------- 绘制（沿用渲染器变换） ----------
  draw(ctx) {
    const R = this.R;
    const z = R.cam.z;
    ctx.setTransform(R.dpr * z, 0, 0, R.dpr * z,
      R.dpr * (R.cw / 2 - R.cam.x * TILE * z), R.dpr * (R.ch / 2 - R.cam.y * TILE * z));

    // 船
    for (const bt of this.boats) {
      const i0 = bt.path[Math.min(bt.seg, bt.path.length - 1)];
      const i1 = bt.path[Math.min(bt.seg + 1, bt.path.length - 1)];
      const x0 = (i0 % R.map.W) * TILE + TILE / 2, y0 = ((i0 / R.map.W) | 0) * TILE + TILE / 2;
      const x1 = (i1 % R.map.W) * TILE + TILE / 2, y1 = ((i1 / R.map.W) | 0) * TILE + TILE / 2;
      const x = x0 + (x1 - x0) * bt.t, y = y0 + (y1 - y0) * bt.t;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      ctx.save();
      ctx.translate(x, y + Math.sin(this.game.day + bt.t * 6) * 1.2);
      ctx.rotate(ang);
      ctx.fillStyle = '#6e5b42';
      ctx.beginPath();
      ctx.moveTo(-11, 0); ctx.quadraticCurveTo(0, 5.5, 11, 0); ctx.quadraticCurveTo(0, 2.5, -11, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,50,36,0.9)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(-2, -9); ctx.lineTo(7, -1); ctx.closePath();
      ctx.fillStyle = 'rgba(240,235,220,0.9)'; ctx.fill();
      ctx.restore();
    }

    // 行人
    for (const w of this.walkers) {
      const i0 = w.path[Math.min(w.seg, w.path.length - 1)];
      const i1 = w.path[Math.min(w.seg + 1, w.path.length - 1)];
      const x0 = (i0 % R.map.W) * TILE + TILE / 2, y0 = ((i0 / R.map.W) | 0) * TILE + TILE / 2;
      const x1 = (i1 % R.map.W) * TILE + TILE / 2, y1 = ((i1 / R.map.W) | 0) * TILE + TILE / 2;
      const x = x0 + (x1 - x0) * w.t;
      const y = y0 + (y1 - y0) * w.t;
      const bob = Math.abs(Math.sin(w.t * Math.PI * 3)) * 1.2;
      const s = z > 0.9 ? 1 : 0.8;
      // 影
      ctx.fillStyle = 'rgba(60,55,45,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y + 2.5, 3.2 * s, 1.4 * s, 0, 0, 7); ctx.fill();
      // 身（靛青/赭色衣服）
      ctx.fillStyle = w.hue < 0.33 ? '#4a5a6e' : w.hue < 0.66 ? '#7a5c40' : '#5e6e52';
      ctx.beginPath(); ctx.ellipse(x, y - 3 * s - bob, 2 * s, 3 * s, 0, 0, 7); ctx.fill();
      // 斗笠
      if (z > 0.75) {
        ctx.fillStyle = '#c2a468';
        ctx.beginPath();
        ctx.moveTo(x - 3 * s, y - 5.5 * s - bob);
        ctx.lineTo(x, y - 8 * s - bob);
        ctx.lineTo(x + 3 * s, y - 5.5 * s - bob);
        ctx.closePath(); ctx.fill();
      }
    }

    // 季节粒子
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.9;
      ctx.fillStyle = p.col;
      if (p.season === 3) {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin + p.y * 0.02);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 7); ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // 焰火
    if (this.rocket) {
      const r = this.rocket;
      if (!r.dots) {
        ctx.fillStyle = r.col;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.5, 0, 7); ctx.fill();
      } else {
        for (const d of r.dots) {
          if (d.life <= 0) continue;
          ctx.globalAlpha = Math.max(0, d.life);
          ctx.fillStyle = r.col;
          ctx.beginPath(); ctx.arc(d.x, d.y, 1.8, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  }
}
