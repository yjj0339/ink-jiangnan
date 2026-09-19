// 游戏核心模拟：经济/人口/幸福/事件/任务/科技 —— 无 DOM 依赖，Node 可直接运行
import * as C from './config.js';
import { clamp, idx, mulberry32 } from './util.js';

export const bus = new EventTarget();
export function emit(type, detail) { bus.dispatchEvent(new CustomEvent(type, { detail })); }

let UID = 1;

export class Game {
  constructor(map, seed) {
    this.map = map;
    this.seed = seed;
    this.rand = mulberry32((seed * 2654435761) >>> 0);
    this.day = 0;
    this.speed = 1;
    this.silver = C.START.silver;
    this.res = { ...C.START.res };
    this.pop = C.START.pop;
    this.hap = 55;
    this.taxLevel = C.START.taxLevel;
    this.rp = 0;
    this.researching = null;
    this.techProgress = 0;
    this.techs = new Set();
    this.roads = new Set();
    this.buildings = [];
    this.quests = { idx: 0 };
    this.achvs = new Set();
    this.log = [];
    this.history = [];
    this.temp = { farmBoost: 1, farmBoostDays: 0, snowBonus: 0, wedding: 0, hapMods: [] };
    this.stats = { built: 0, demolished: 0, traded: 0, fires: 0, events: [] };
    this.hungerDays = 0;
    this.jobs = 0; this.pool = 0; this.baseEff = 0; this.housingCap = 0;
    this.fireworksUntil = -1;
    this._caps = null;
    this.occ = new Int32Array(map.W * map.H); // 0=空 否则建筑uid
  }

  // ---- 时间 ----
  get season() { return Math.floor(this.day / C.SEASON_LEN) % 4; }
  get year() { return Math.floor(this.day / C.YEAR_LEN) + 1; }
  get seasonName() { return C.SEASONS[this.season]; }

  // ---- 查询 ----
  buildingAt(x, y) {
    if (x < 0 || y < 0 || x >= this.map.W || y >= this.map.H) return null;
    const uid = this.occ[idx(x, y, this.map.W)];
    if (!uid) return null;
    return this.buildings.find(b => b.uid === uid) || null;
  }
  isRoad(x, y) { return this.roads.has(idx(x, y, this.map.W)); }
  count(defId) { return this.buildings.filter(b => b.defId === defId).length; }
  roadCount() { return this.roads.size; }
  capOf(k) { this.ensureCaps(); return this._caps[k]; }
  ensureCaps() {
    const caps = {};
    for (const k of C.RES_ORDER) caps[k] = C.RES_META[k].cap;
    for (const b of this.buildings) {
      if (b.damaged || !b.def.storage) continue;
      if (b.def.storage.food) caps.food += b.def.storage.food;
      if (b.def.storage.each) for (const k of C.RES_ORDER) caps[k] += b.def.storage.each;
    }
    this._caps = caps;
  }

  tileOk(def, x, y) {
    const t = this.map.terrain[idx(x, y, this.map.W)];
    if (def.road) return t !== C.TERRAIN.WATER;
    if (def.bridge) return t === C.TERRAIN.WATER;
    if (def.onTerrain === 'land') return t !== C.TERRAIN.WATER;
    return t === C.TERRAIN[def.onTerrain];
  }

  nearWaterSpot(def, x, y) {
    for (let dy = -1; dy <= def.h; dy++) for (let dx = -1; dx <= def.w; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.map.W || ny >= this.map.H) continue;
      if (dx >= 0 && dx < def.w && dy >= 0 && dy < def.h) continue; // 自身不算
      if (this.map.terrain[idx(nx, ny, this.map.W)] === C.TERRAIN.WATER) return true;
    }
    return false;
  }

  canPlace(defId, x, y) {
    const def = C.B[defId];
    if (!def) return { ok: false, reason: '未知建筑' };
    if (def.tech && !this.techs.has(def.tech)) {
      const t = C.TECHS.find(t => t.id === def.tech);
      return { ok: false, reason: `需先研习「${t ? t.name : def.tech}」` };
    }
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= this.map.W || ty >= this.map.H) return { ok: false, reason: '超出地界' };
      if (this.occ[idx(tx, ty, this.map.W)]) return { ok: false, reason: '此处已有建筑' };
      if (!this.tileOk(def, tx, ty)) {
        const tn = C.TERRAIN_NAME[this.map.terrain[idx(tx, ty, this.map.W)]];
        return { ok: false, reason: `${def.name} 不能建在${tn}上` };
      }
    }
    if (def.nearWater && !this.nearWaterSpot(def, x, y)) return { ok: false, reason: '码头须临水而建' };
    if (def.farm) {
      let n = 0;
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++)
        if (this.map.terrain[idx(x + dx, y + dy, this.map.W)] === C.TERRAIN.FERTILE) n++;
      if (n < 4) return { ok: false, reason: '沃土太少（至少需 4 格沃土）' };
    }
    return { ok: true, reason: '' };
  }

  farmFertFrac(x, y, w, h) {
    let n = 0;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
      if (this.map.terrain[idx(x + dx, y + dy, this.map.W)] === C.TERRAIN.FERTILE) n++;
    return n / (w * h);
  }

  canAfford(cost) {
    if (!cost) return true;
    if ((cost.silver || 0) > this.silver) return false;
    for (const k of C.RES_ORDER) if ((cost[k] || 0) > this.res[k]) return false;
    return true;
  }
  pay(cost) {
    if (!cost) return;
    this.silver -= cost.silver || 0;
    for (const k of C.RES_ORDER) this.res[k] -= cost[k] || 0;
  }

  place(defId, x, y, free = false) {
    const chk = this.canPlace(defId, x, y);
    if (!chk.ok) return null;
    const def = C.B[defId];
    if (!free) {
      if (!this.canAfford(def.cost)) { emit('toast', { msg: '银两或物料不足', type: 'bad' }); return null; }
      this.pay(def.cost);
    }
    const b = {
      uid: UID++, defId, def, x, y, tier: defId === 'hut' ? 0 : undefined,
      damaged: false, born: this.day, locustDays: 0, eff: 0,
      fertFrac: def.farm ? this.farmFertFrac(x, y, def.w, def.h) : undefined,
    };
    this.buildings.push(b);
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      this.occ[idx(x + dx, y + dy, this.map.W)] = b.uid;
      if (def.road || def.bridge) this.roads.add(idx(x + dx, y + dy, this.map.W));
    }
    this.stats.built++;
    this._caps = null;
    emit('build', b);
    return b;
  }

  demolish(x, y) {
    const b = this.buildingAt(x, y);
    if (!b) return null;
    this.silver += Math.floor((b.def.cost.silver || 0) * 0.3);
    for (let dy = 0; dy < b.def.h; dy++) for (let dx = 0; dx < b.def.w; dx++) {
      this.occ[idx(b.x + dx, b.y + dy, this.map.W)] = 0;
      this.roads.delete(idx(b.x + dx, b.y + dy, this.map.W));
    }
    this.buildings = this.buildings.filter(o => o.uid !== b.uid);
    this.stats.demolished++;
    this._caps = null;
    emit('demolish', b);
    return b;
  }

  hasRoadAccess(b) {
    const { x, y, def } = b;
    for (let dx = -1; dx <= def.w; dx++) {
      if (this.isRoad(x + dx, y - 1) || this.isRoad(x + dx, y + def.h)) return true;
    }
    for (let dy = 0; dy < def.h; dy++) {
      if (this.isRoad(x - 1, y + dy) || this.isRoad(x + def.w, y + dy)) return true;
    }
    return false;
  }

  center(b) { return { x: b.x + b.def.w / 2, y: b.y + b.def.h / 2 }; }

  covered(b, type) {
    const c = this.center(b);
    for (const s of this.buildings) {
      if (s.damaged || s.uid === b.uid || !s.def.service || s.def.service.type !== type) continue;
      if (s.eff <= 0 && s.def.workers > 0) continue;
      const sc = this.center(s);
      const r = s.def.service.radius;
      if (Math.abs(c.x - sc.x) <= r + s.def.w / 2 && Math.abs(c.y - sc.y) <= r + s.def.h / 2) return true;
    }
    return false;
  }

  coverageRatio(type) {
    let total = 0, covered = 0;
    for (const b of this.buildings) {
      if (b.defId !== 'hut') continue;
      const cap = C.HOUSE_TIERS[b.tier].cap;
      total += cap;
      if (this.covered(b, type)) covered += cap;
    }
    return total ? covered / total : 0;
  }

  nearRiver(b, dist) {
    for (let dy = 0; dy < b.def.h; dy++) for (let dx = 0; dx < b.def.w; dx++) {
      if (this.map.distWater[idx(b.x + dx, b.y + dy, this.map.W)] <= dist) return true;
    }
    return false;
  }

  addHapTemp(v, days) { this.temp.hapMods.push({ v, days }); }

  pushLog(msg) { this.log.unshift({ day: this.day, season: this.seasonName, year: this.year, msg }); if (this.log.length > 80) this.log.pop(); }
  toast(msg, type = 'info') { emit('toast', { msg, type }); }

  // ---- 每日推进 ----
  tickDay() {
    this.day++;
    if (this.day % C.SEASON_LEN === 0) this.onSeasonStart();
    this.updateTemp();
    this.produce();
    this.eat();
    this.tradeAuto();
    this.researchTick();
    this.upkeepTick();
    this.taxTick();
    this.happinessTick();
    this.popTick();
    this.questTick();
    this.achvTick();
    this.history.push({ d: this.day, pop: this.pop, food: this.res.food, hap: this.hap, silver: this.silver });
    if (this.history.length > 960) this.history.shift();
    emit('tick', this.day);
  }

  updateTemp() {
    const t = this.temp;
    if (t.farmBoostDays > 0) { t.farmBoostDays--; if (t.farmBoostDays <= 0) { t.farmBoost = 1; } }
    if (t.wedding > 0) t.wedding--;
    t.hapMods = t.hapMods.filter(m => (m.days-- > 0));
  }

  functional(b) { return !b.damaged && this.hasRoadAccess(b); }

  produce() {
    // 就业
    let jobs = 0;
    for (const b of this.buildings) {
      b.eff = 0;
      if (!this.functional(b)) continue;
      jobs += b.def.workers || 0;
    }
    const pool = Math.floor(this.pop * C.WORKER_RATIO);
    const baseEff = jobs > 0 ? clamp(pool / jobs, 0, 1) : 0;
    this.jobs = jobs; this.pool = pool; this.baseEff = baseEff;

    this.ensureCaps();
    for (const b of this.buildings) {
      if (!this.functional(b)) continue;
      b.eff = (b.def.workers > 0) ? baseEff : 1;
      if (b.locustDays > 0) { b.locustDays--; b.eff = 0; continue; }
      const def = b.def;
      if (!def.prod || !Object.keys(def.prod).length) continue;

      let eff = b.eff;
      if (def.farm) {
        eff *= C.SEASON_FARM[this.season];
        eff *= b.fertFrac ?? 1;
        let tm = 1;
        if (this.techs.has('agronomy')) tm += 0.25;
        if (this.techs.has('hydraulics') && this.nearRiver(b, 2)) tm += 0.2;
        if (this.season === 0 && this.temp.snowBonus > 0) tm += this.temp.snowBonus;
        eff *= tm * this.temp.farmBoost;
      }
      if (def.forestScale) eff *= 0.5 + 0.5 * (this.map.forestNear[idx(b.x + 1, b.y + 1, this.map.W)]);
      // 投入约束
      if (def.inp) {
        for (const k in def.inp) {
          const need = def.inp[k] * eff;
          if (need > 0 && this.res[k] < need) eff *= this.res[k] / need;
        }
        for (const k in def.inp) this.res[k] = Math.max(0, this.res[k] - def.inp[k] * eff);
      }
      b.eff = eff;
      for (const k in def.prod) {
        this.res[k] = Math.min(this._caps[k], this.res[k] + def.prod[k] * eff);
      }
    }
  }

  eat() {
    const need = this.pop * C.FOOD_PER_PERSON * C.SEASON_EAT[this.season];
    if (this.res.food >= need) { this.res.food -= need; if (this.hungerDays > 0) this.hungerDays--; }
    else { this.res.food = 0; this.hungerDays++; }
  }

  tradeAuto() {
    for (const b of this.buildings) {
      if (!b.def.trade || !this.functional(b) || b.eff <= 0) continue;
      const dock = !!b.def.trade.dock;
      const tput = b.def.trade.throughput * (0.5 + 0.5 * b.eff);
      this.ensureCaps();
      for (const k of C.RES_ORDER) {
        const cap = this._caps[k], meta = C.RES_META[k];
        // 自动售出盈余（保留较高水位，避免卡死高价营造）
        const excess = this.res[k] - cap * 0.8;
        if (excess > 5) {
          const n = Math.min(tput, excess);
          this.res[k] -= n;
          const gain = n * meta.price * (dock ? 1.1 : 1);
          this.silver += gain; this.stats.traded += gain;
        }
        // 自动购入短缺（仅粮食）
        if (k === 'food' && this.res.food < cap * 0.25 && this.silver > 60) {
          const n = Math.min(tput, cap * 0.25 - this.res.food);
          const cost = n * meta.price * (dock ? C.DOCK_BUY_MULT : C.BUY_MULT);
          if (cost <= this.silver) { this.silver -= cost; this.res.food += n; }
        }
      }
    }
  }

  researchTick() {
    let gain = 0;
    for (const b of this.buildings) {
      if (b.defId !== 'academy' || !this.functional(b) || b.eff <= 0) continue;
      let g0 = b.def.research.base;
      if (this.res.paper >= b.def.research.paperUse) {
        this.res.paper -= b.def.research.paperUse;
        g0 += b.def.research.paperBoost;
      }
      gain += g0;
    }
    this.rp += gain;
    if (this.researching) {
      const tech = C.TECHS.find(t => t.id === this.researching);
      if (!tech) { this.researching = null; return; }
      const use = Math.min(this.rp, tech.cost - this.techProgress);
      if (use > 0) { this.rp -= use; this.techProgress += use; }
      if (this.techProgress >= tech.cost) {
        this.techs.add(tech.id);
        this.researching = null; this.techProgress = 0;
        this.toast(`科技研成：「${tech.name}」`, 'good');
        this.pushLog(`书院研成「${tech.name}」。`);
        emit('tech', tech.id);
      }
    }
  }

  upkeepTick() {
    let up = 0;
    for (const b of this.buildings) {
      if (b.damaged || !b.def.upkeep) continue;
      if (b.def.workers > 0 && b.eff <= 0) continue;
      up += b.def.upkeep;
    }
    if (up > 0) {
      if (this.silver >= up) this.silver -= up;
      else { this.silver = 0; this.addHapTemp(-2, 3); }
    }
  }

  happinessTick() {
    let t = 50;
    if (this.hungerDays > 0) t -= 30 + Math.min(10, this.hungerDays);
    else t += this.res.food / Math.max(1, this.capOf('food')) > 0.1 ? 8 : 2;
    t += this.coverageRatio('ent') * 14;
    t += this.coverageRatio('spirit') * 8;
    t += this.coverageRatio('health') * 7;
    if (this.res.porcelain > 10) t += 3;
    if (this.res.paper > 10) t += 2;
    t -= C.TAX_LEVELS[this.taxLevel].hap;
    const unemp = this.pool > this.jobs ? (this.pool - this.jobs) / this.pool : 0;
    t -= unemp * 18;
    this.ensureCaps();
    const hcap = this.housingCapacity();
    if (hcap > 0 && this.pop / hcap > 0.95) t -= 5;
    t += C.SEASON_HAP[this.season];
    for (const m of this.temp.hapMods) t += m.v;
    t = clamp(t, 5, 98);
    this.hap += (t - this.hap) * 0.08;
    this.hap = clamp(this.hap, 0, 100);
  }

  housingCapacity() {
    let cap = 0;
    for (const b of this.buildings) {
      if (b.defId !== 'hut') continue;
      cap += C.HOUSE_TIERS[b.tier].cap * (b.damaged ? 0 : 1);
    }
    this.housingCap = cap;
    return cap;
  }

  popTick() {
    const cap = this.housingCapacity();
    if (this.hungerDays > 0) {
      this.pop = Math.max(4, this.pop * 0.995);
    } else if (this.hap < 30) {
      this.pop = Math.max(4, this.pop * 0.998);
    } else if (this.pop < cap) {
      let growth = (0.15 + cap * 0.0018) * clamp(this.hap / 70, 0.4, 1.4);
      if (this.temp.wedding > 0) growth *= 2;
      this.pop = Math.min(cap, this.pop + growth);
    }
  }

  questTick() {
    while (this.quests.idx < C.QUESTS.length) {
      const q = C.QUESTS[this.quests.idx];
      if (!q.check(this)) break;
      if (q.reward) {
        if (q.reward.silver) this.silver += q.reward.silver;
        if (q.reward.rp) this.rp += q.reward.rp;
        for (const k of C.RES_ORDER) if (q.reward[k]) this.res[k] += q.reward[k];
      }
      this.toast(`任务达成「${q.name}」：${q.rewardText}`, 'good');
      this.pushLog(`任务「${q.name}」达成。`);
      if (q.final) {
        this.fireworksUntil = this.day + 4;
        emit('fireworks', {});
      }
      this.quests.idx++;
    }
  }

  achvTick() {
    for (const a of C.ACHIEVEMENTS) {
      if (this.achvs.has(a.id)) continue;
      if (a.check(this)) {
        this.achvs.add(a.id);
        this.toast(`成就达成「${a.name}」`, 'achv');
      }
    }
  }

  onSeasonStart() {
    const season = this.season;
    // 瑞雪结算：入春生效
    if (season === 0 && this.temp.snowBonus > 0) {
      this.temp.farmBoost = 1 + this.temp.snowBonus;
      this.temp.farmBoostDays = C.SEASON_LEN;
      this.temp.snowBonus = 0;
    }
    const pool = C.EVENTS.filter(e =>
      (e.seasonsOnly ? e.seasonsOnly.includes(season) : true) &&
      (!e.minYear || this.year >= e.minYear));
    if (!pool.length || this.rand() > 0.62) return;
    let total = 0; for (const e of pool) total += e.weight;
    let r = this.rand() * total, ev = pool[0];
    for (const e of pool) { r -= e.weight; if (r <= 0) { ev = e; break; } }
    ev.apply(this);
    this.stats.events.push({ day: this.day, id: ev.id });
    this.toast(`【${ev.name}】${ev.msg}`, ev.kind === 'good' ? 'good' : 'bad');
    this.pushLog(`【${ev.name}】${ev.msg}`);
  }

  // ---- 民宅升级 / 修缮 ----
  houseInfo(b) { return C.HOUSE_TIERS[b.tier]; }

  canUpgradeHouse(b) {
    if (b.defId !== 'hut' || b.damaged) return { ok: false, reason: '' };
    const next = C.HOUSE_TIERS[b.tier + 1];
    if (!next) return { ok: false, reason: '已是最高规格' };
    if (next.need && !this.techs.has('architecture')) return { ok: false, reason: '需研习「营造学」' };
    if (next.need?.hap && this.hap < next.need.hap) return { ok: false, reason: `幸福需 ≥${next.need.hap}` };
    if (next.need?.market && !this.covered(b, 'market')) return { ok: false, reason: '需在集市辐射内' };
    if (next.need?.ent && !this.covered(b, 'ent')) return { ok: false, reason: '需在茶馆/戏台辐射内' };
    if (!this.canAfford(next.upCost)) return { ok: false, reason: '物料不足' };
    return { ok: true, next };
  }

  upgradeHouse(b) {
    const chk = this.canUpgradeHouse(b);
    if (!chk.ok) { if (chk.reason) this.toast(chk.reason, 'bad'); return false; }
    this.pay(chk.next.upCost);
    b.tier++;
    this.toast(`民宅升为「${chk.next.name}」`, 'good');
    emit('tierup', b);
    return true;
  }

  repairCost(b) { return Math.ceil((b.def.cost.silver || 0) * 0.4); }
  repair(b) {
    if (!b.damaged) return;
    const c = this.repairCost(b);
    if (this.silver < c) { this.toast('银两不足，无法修缮', 'bad'); return; }
    this.silver -= c;
    b.damaged = false;
    this._caps = null;
    this.toast(`${b.def.name} 修缮完毕`, 'good');
    emit('repair', b);
  }

  // ---- 税收（每日计入） ----
  taxIncomePerDay() {
    let v = C.taxIncome(this.pop, this.taxLevel, this.techs);
    for (const b of this.buildings) {
      if (b.def.taxBonus && !b.damaged && this.hasRoadAccess(b) && b.eff > 0) v += b.def.taxBonus;
    }
    return v;
  }
  taxTick() { this.silver += this.taxIncomePerDay(); }

  // ---- 开局赠建：路口 + 两座草屋 ----
  initStart() {
    const s = this.map.spawn;
    for (let i = 0; i < 6; i++) if (this.canPlace('road', s.x + i, s.y).ok) this.place('road', s.x + i, s.y, true);
    for (let j = 1; j <= 3; j++) if (this.canPlace('road', s.x, s.y + j).ok) this.place('road', s.x, s.y + j, true);
    for (const [hx, hy] of [[s.x + 1, s.y - 2], [s.x + 4, s.y + 1], [s.x + 1, s.y + 1], [s.x + 4, s.y - 2]]) {
      if (this.buildings.filter(b => b.defId === 'hut').length >= 2) break;
      if (this.canPlace('hut', hx, hy).ok) this.place('hut', hx, hy, true);
    }
  }

  // ---- 序列化 ----
  toJSON() {
    return {
      v: 2, seed: this.seed, day: this.day, speed: this.speed,
      silver: this.silver, res: this.res, pop: this.pop, hap: this.hap,
      taxLevel: this.taxLevel, rp: this.rp, researching: this.researching,
      techProgress: this.techProgress, techs: [...this.techs],
      roads: [...this.roads],
      buildings: this.buildings.map(b => ({ defId: b.defId, x: b.x, y: b.y, tier: b.tier, damaged: b.damaged, born: b.born })),
      quests: { idx: this.quests.idx }, achvs: [...this.achvs],
      stats: this.stats, log: this.log.slice(0, 30), history: this.history,
      hungerDays: this.hungerDays,
    };
  }

  static load(map, data) {
    const g = new Game(map, data.seed);
    g.day = data.day; g.speed = data.speed ?? 1;
    g.silver = data.silver; Object.assign(g.res, data.res);
    g.pop = data.pop; g.hap = data.hap; g.taxLevel = data.taxLevel;
    g.rp = data.rp; g.researching = data.researching; g.techProgress = data.techProgress;
    g.techs = new Set(data.techs);
    g.quests = { idx: data.quests.idx };
    g.achvs = new Set(data.achvs);
    g.stats = data.stats; g.log = data.log || []; g.history = data.history || [];
    g.hungerDays = data.hungerDays || 0;
    for (const rb of data.buildings) {
      const def = C.B[rb.defId];
      if (!def) continue;
      const b = { uid: UID++, defId: rb.defId, def, x: rb.x, y: rb.y, tier: rb.tier,
        damaged: rb.damaged, born: rb.born ?? 0, locustDays: 0, eff: 0,
        fertFrac: def.farm ? this.farmFertFrac(rb.x, rb.y, def.w, def.h) : undefined };
      g.buildings.push(b);
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++)
        g.occ[idx(b.x + dx, b.y + dy, map.W)] = b.uid;
    }
    g.roads = new Set(data.roads);
    g._caps = null;
    return g;
  }
}
