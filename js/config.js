// 全部游戏数值与静态定义 —— 经济锚点：售价≈成本×2.5~3.5；初始资金≈3轮早期建设；幸福度为慢变量
// 建筑产能为「每日·效率1」基准；银两主收入=税赋+贸易

export const W = 48, H = 48;              // 地图尺寸
export const SEASON_LEN = 15;             // 每季天数
export const YEAR_LEN = SEASON_LEN * 4;
export const DAY_MS = 420;                // 1x 速度下一天毫秒
export const SPEEDS = [0, 1, 2, 4];

export const SEASONS = ['春', '夏', '秋', '冬'];
export const SEASON_FARM = [0.8, 1.0, 1.3, 0.0];   // 农田季节系数（秋收）
export const SEASON_HAP = [2, 0, 1, -3];
export const SEASON_EAT = [1, 1, 1, 1.15];         // 冬季多吃

export const TERRAIN = { GRASS: 0, WATER: 1, FERTILE: 2, FOREST: 3, ROCK: 4, ORE: 5 };
export const TERRAIN_NAME = ['草地', '水面', '沃土', '林地', '岩坡', '矿脉'];

// ---------- 资源 ----------
export const RES_META = {
  food:      { name: '粮食', char: '粮', color: '#7a8b3c', cap: 250, price: 1.2, desc: '民以食为天，人口存续之本' },
  wood:      { name: '木材', char: '木', color: '#8a6a44', cap: 200, price: 1.5, desc: '伐木场产出，营造之基' },
  stone:     { name: '石料', char: '石', color: '#7d7f7a', cap: 200, price: 2.0, desc: '采石场产出，修桥筑庙' },
  iron:      { name: '铁料', char: '铁', color: '#5c6470', cap: 200, price: 3.0, desc: '矿场产出，锻造工具' },
  tools:     { name: '工具', char: '工', color: '#a0522d', cap: 100, price: 8.0, desc: '木匠坊锻造，民宅升级所需' },
  porcelain: { name: '瓷器', char: '瓷', color: '#4f7f8b', cap: 100, price: 12,  desc: '瓷窑烧制，高价值商品' },
  paper:     { name: '纸张', char: '纸', color: '#9b8556', cap: 100, price: 6.0, desc: '纸坊抄造，书院研习所需' },
};
export const RES_ORDER = ['food', 'wood', 'stone', 'iron', 'tools', 'porcelain', 'paper'];
export const BUY_MULT = 1.6, DOCK_BUY_MULT = 1.4;

// 民宅三级
export const HOUSE_TIERS = [
  { id: 'hut',      name: '草屋', cap: 6,  upCost: null },
  { id: 'tilehouse', name: '瓦房', cap: 12, upCost: { silver: 60, tools: 10 }, need: { hap: 55, market: true } },
  { id: 'mansion',  name: '楼阁', cap: 20, upCost: { silver: 140, tools: 20, paper: 10 }, need: { hap: 65, market: true, ent: true } },
];

// ---------- 建筑 ----------
// onTerrain: 'land' 任意陆地 | 'water' 水面 | 具体地形 key
// service: {type, radius} type: fire/safety/market/ent/spirit/health
export const CATS = ['基础', '民居', '农耕', '采掘', '加工', '仓储', '民生', '商贸', '文教'];
export const BUILDINGS = [
  { id: 'road', name: '道路', cat: '基础', w: 1, h: 1, cost: { silver: 2 }, road: true, onTerrain: 'land',
    desc: '连接各处。绝大多数建筑需临路才能运作。' },
  { id: 'bridge', name: '石桥', cat: '基础', w: 1, h: 1, cost: { silver: 150, stone: 80 }, bridge: true, onTerrain: 'water',
    desc: '跨水通路，可让行人往来两岸。' },

  { id: 'hut', name: '草屋', cat: '民居', w: 2, h: 2, cost: { silver: 30, wood: 10 }, housing: 0, onTerrain: 'land',
    desc: '安置乡民。幸福与货物充足时可逐级升级为瓦房、楼阁。' },

  { id: 'farm', name: '农田', cat: '农耕', w: 3, h: 3, cost: { silver: 40, wood: 10 }, workers: 3,
    prod: { food: 7 }, onTerrain: 'land', fertileScale: true, farm: true,
    desc: '须建于沃土（至少 4 格沃土，越肥越丰）。春种秋收，冬季休耕。' },

  { id: 'lumber', name: '伐木场', cat: '采掘', w: 2, h: 2, cost: { silver: 40 }, workers: 2,
    prod: { wood: 3.0 }, onTerrain: 'land', forestScale: true,
    desc: '邻近林地越多，出材越丰（相邻 3 格计）。' },
  { id: 'quarry', name: '采石场', cat: '采掘', w: 2, h: 2, cost: { silver: 60 }, workers: 2,
    prod: { stone: 1.8 }, onTerrain: 'ROCK',
    desc: '须建于岩坡，开采石料。' },
  { id: 'mine', name: '铁矿场', cat: '采掘', w: 2, h: 2, cost: { silver: 80, wood: 20 }, workers: 3,
    prod: { iron: 1.2 }, onTerrain: 'ORE',
    desc: '须建于矿脉，开采铁料。' },

  { id: 'carpenter', name: '木匠坊', cat: '加工', w: 2, h: 2, cost: { silver: 80, wood: 40 }, workers: 3,
    inp: { wood: 1.6 }, prod: { tools: 0.9 }, onTerrain: 'land',
    desc: '木材锻造工具，民宅升级必需。' },
  { id: 'kiln', name: '瓷窑', cat: '加工', w: 2, h: 2, cost: { silver: 140, wood: 60, stone: 40 }, workers: 3,
    inp: { stone: 1.4 }, prod: { porcelain: 0.9 }, onTerrain: 'land', tech: 'porcelain',
    desc: '石料烧制瓷器，高价值商品，亦添生活雅趣。' },
  { id: 'papermill', name: '纸坊', cat: '加工', w: 2, h: 2, cost: { silver: 140, wood: 80 }, workers: 3,
    inp: { wood: 1.6 }, prod: { paper: 0.9 }, onTerrain: 'land', tech: 'papermaking',
    desc: '楮皮抄纸，供书院与戏台，亦可贩卖。' },

  { id: 'granary', name: '粮仓', cat: '仓储', w: 2, h: 2, cost: { silver: 80, wood: 40 }, workers: 1,
    storage: { food: 250 }, onTerrain: 'land',
    desc: '粮食存上限 +250，乱世丰年皆靠它。' },
  { id: 'warehouse', name: '仓库', cat: '仓储', w: 2, h: 2, cost: { silver: 100, wood: 50 }, workers: 1,
    storage: { each: 120 }, onTerrain: 'land',
    desc: '所有物资存上限 +120。' },

  { id: 'market', name: '集市', cat: '民生', w: 3, h: 3, cost: { silver: 100, wood: 60, stone: 20 }, workers: 3,
    upkeep: 1, service: { type: 'market', radius: 5 }, taxBonus: 2, onTerrain: 'land',
    desc: '五百年市集烟火。周边民宅得以升级，每日另有税入。' },
  { id: 'well', name: '水井', cat: '民生', w: 1, h: 1, cost: { silver: 30, stone: 10 }, workers: 0,
    service: { type: 'fire', radius: 4 }, onTerrain: 'land',
    desc: '防火消灾。范围内建筑火灾风险大减。' },
  { id: 'watchtower', name: '望楼', cat: '民生', w: 1, h: 1, cost: { silver: 90, stone: 30 }, workers: 1,
    upkeep: 0.5, service: { type: 'safety', radius: 6 }, onTerrain: 'land',
    desc: '瞭望防盗，兼防火。范围内山贼不敢来犯。' },
  { id: 'teahouse', name: '茶馆', cat: '民生', w: 2, h: 2, cost: { silver: 120, wood: 60 }, workers: 2,
    upkeep: 1, service: { type: 'ent', radius: 5 }, onTerrain: 'land',
    desc: '说书闲谈，烟火人间。提升周边幸福。' },
  { id: 'clinic', name: '医馆', cat: '民生', w: 2, h: 2, cost: { silver: 200, wood: 80, stone: 40 }, workers: 3,
    upkeep: 1, service: { type: 'health', radius: 7 }, onTerrain: 'land', tech: 'medicine',
    desc: '悬壶济世。瘟疫来时护佑一方。' },
  { id: 'stage', name: '戏台', cat: '民生', w: 3, h: 3, cost: { silver: 240, wood: 100, paper: 40 }, workers: 3,
    upkeep: 1, service: { type: 'ent', radius: 9 }, onTerrain: 'land', tech: 'opera',
    desc: '水磨腔调，四乡来听。大幅提升幸福。' },
  { id: 'temple', name: '庙宇', cat: '民生', w: 3, h: 3, cost: { silver: 260, wood: 120, stone: 80 }, workers: 1,
    upkeep: 1, service: { type: 'spirit', radius: 7 }, onTerrain: 'land',
    desc: '香火绵延，民心得安。' },

  { id: 'tradehouse', name: '商行', cat: '商贸', w: 2, h: 2, cost: { silver: 180, wood: 80, stone: 40 }, workers: 2,
    upkeep: 1, trade: { throughput: 6 }, onTerrain: 'land',
    desc: '互通有无。自动贩售盈余、购入短缺，可手动交易。' },
  { id: 'dock', name: '码头', cat: '商贸', w: 2, h: 2, cost: { silver: 220, wood: 120, tools: 60 }, workers: 4,
    upkeep: 1, trade: { throughput: 15, dock: true }, nearWater: true, onTerrain: 'land', tech: 'navigation',
    desc: '须临水而建。船运吞吐数倍于商行，价格更优。' },

  { id: 'academy', name: '书院', cat: '文教', w: 3, h: 3, cost: { silver: 200, wood: 80 }, workers: 3,
    upkeep: 1, research: { base: 0.7, paperBoost: 1.8, paperUse: 1 }, onTerrain: 'land',
    desc: '弦歌不辍。产研究点以研习科技；供纸则事半功倍。' },
];

export const B = {};
for (const d of BUILDINGS) B[d.id] = d;

// ---------- 科技 ----------
export const TECHS = [
  { id: 'agronomy',   name: '农学',   cost: 40,  req: [],              desc: '农田产量 +25%' },
  { id: 'hydraulics', name: '水利',   cost: 70,  req: ['agronomy'],    desc: '临水农田再 +20%；解锁医馆前置' },
  { id: 'porcelain',  name: '制瓷',   cost: 80,  req: [],              desc: '解锁瓷窑' },
  { id: 'papermaking',name: '造纸',   cost: 100, req: [],              desc: '解锁纸坊' },
  { id: 'architecture',name: '营造学',cost: 90,  req: [],              desc: '解锁民宅升级与石桥' },
  { id: 'navigation', name: '舟楫',   cost: 120, req: ['architecture'],desc: '解锁码头' },
  { id: 'astronomy',  name: '算学',   cost: 110, req: [],              desc: '税赋收入 +20%' },
  { id: 'medicine',   name: '医道',   cost: 150, req: ['hydraulics'],  desc: '解锁医馆' },
  { id: 'opera',      name: '戏乐',   cost: 160, req: ['papermaking'], desc: '解锁戏台' },
  { id: 'stargazing', name: '观星',   cost: 130, req: ['astronomy'],   desc: '天灾可提前两季预警' },
];

// ---------- 税赋 ----------
export const TAX_LEVELS = [
  { name: '免税', mult: 0,    hap: 0 },
  { name: '低税', mult: 1.0,  hap: 2 },
  { name: '中税', mult: 1.35, hap: 5 },
  { name: '高税', mult: 1.7,  hap: 9 },
  { name: '重税', mult: 2.1,  hap: 14 },
];
export const TAX_PER_CAPITA = 0.06;   // 每人每日基准税银

// ---------- 人口 ----------
export const WORKER_RATIO = 0.75;
export const FOOD_PER_PERSON = 0.06;

// ---------- 初始 ----------
export const START = {
  silver: 800,
  res: { food: 150, wood: 120, stone: 60, iron: 0, tools: 0, porcelain: 0, paper: 0 },
  pop: 8,
  taxLevel: 1,
};

// ---------- 事件（每季判定） ----------
export const EVENTS = [
  { id: 'harvest', name: '丰年', weight: 10, kind: 'good',
    msg: '风调雨顺，今季农田产出 +50%。',
    apply(g) { g.temp.farmBoost = Math.max(g.temp.farmBoost, 1.5); g.temp.farmBoostDays = SEASON_LEN; } },
  { id: 'locust', name: '蝗灾', weight: 7, kind: 'bad', minYear: 2,
    msg: '蝗群过境！部分农田歉收数日。',
    apply(g) {
      const farms = g.buildings.filter(b => b.defId === 'farm' && !b.damaged);
      const n = Math.min(farms.length, 1 + Math.floor(g.rand() * Math.ceil(farms.length / 2)));
      for (let i = 0; i < n; i++) { const f = farms[Math.floor(g.rand() * farms.length)]; if (f) f.locustDays = 12; }
    } },
  { id: 'fire', name: '火灾', weight: 8, kind: 'bad', minYear: 2,
    msg: '城中走水！一处建筑焚毁。',
    apply(g) {
      const cands = g.buildings.filter(b => !b.damaged && !b.def.road && !b.def.bridge);
      if (!cands.length) return;
      const unprotected = cands.filter(b => !g.covered(b, 'fire'));
      const pool = (unprotected.length && g.rand() < 0.75) ? unprotected : cands;
      const b = pool[Math.floor(g.rand() * pool.length)];
      if (g.covered(b, 'fire') && g.rand() < 0.9) { g.pushLog('水井及时扑救，有惊无险。'); return; }
      b.damaged = true; g.stats.fires++;
      g.toast(`火灾！${b.def.name} 焚毁，可出资修缮。`, 'bad');
    } },
  { id: 'flood', name: '洪水', weight: 6, kind: 'bad', minYear: 2,
    msg: '梅雨连绵，河水漫岸。',
    apply(g) {
      let hit = 0;
      for (const b of g.buildings) {
        if (b.damaged || b.def.road || b.def.bridge) continue;
        if (g.nearRiver(b, 2) && g.rand() < 0.35) { b.damaged = true; hit++; }
      }
      if (hit) g.toast(`洪水冲毁了 ${hit} 处建筑，需修缮。`, 'bad');
      else g.pushLog('堤岸坚固，洪水无虞。');
    } },
  { id: 'templefair', name: '庙会', weight: 9, kind: 'good',
    msg: '庙会开锣，四方云集，幸福大增。',
    apply(g) { g.addHapTemp(12, 30); } },
  { id: 'caravan', name: '商队过境', weight: 8, kind: 'good',
    msg: '西域商队高价收购盈余货物。',
    apply(g) {
      let earned = 0;
      for (const k of RES_ORDER) {
        const cap = g.capOf(k), excess = g.res[k] - cap * 0.5;
        if (excess > 10) { const n = Math.floor(excess * 0.3); g.res[k] -= n; earned += n * RES_META[k].price * 1.5; }
      }
      earned = Math.round(earned);
      if (earned > 0) { g.silver += earned; g.stats.traded += earned; g.toast(`商队购货，得银 ${earned}。`, 'good'); }
      else g.pushLog('商队未觅得心仪货物，怅然而去。');
    } },
  { id: 'bandit', name: '山贼', weight: 6, kind: 'bad', minYear: 2,
    msg: '山贼觊觎镇上财货！',
    apply(g) {
      const towers = g.buildings.some(b => b.defId === 'watchtower' && !b.damaged);
      if (towers) { g.pushLog('望楼示警，乡勇齐出，山贼遁走。'); g.addHapTemp(3, 10); }
      else { const loss = Math.round(g.silver * 0.15); g.silver -= loss; g.toast(`山贼劫走白银 ${loss} 两！建望楼可防。`, 'bad'); }
    } },
  { id: 'plague', name: '瘟疫', weight: 5, kind: 'bad', minYear: 3,
    msg: '时疫流行，人心惶惶。',
    apply(g) {
      const hasClinic = g.buildings.some(b => b.defId === 'clinic' && !b.damaged);
      if (hasClinic) { g.pushLog('医馆施药，疫情速退。'); g.addHapTemp(-2, 10); }
      else { const loss = g.pop * 0.05; g.pop -= loss; g.addHapTemp(-10, 30); g.toast(`瘟疫夺去了 ${Math.ceil(loss)} 位乡民！建医馆可防。`, 'bad'); }
    } },
  { id: 'scholar', name: '名士到访', weight: 6, kind: 'good',
    msg: '名士盘桓数日，谈经论道，研究点大增。',
    apply(g) { g.rp += 20; } },
  { id: 'snow', name: '瑞雪', weight: 6, kind: 'good', seasonsOnly: [3],
    msg: '瑞雪兆丰年，来春农田 +10%。',
    apply(g) { g.temp.snowBonus = 0.1; } },
  { id: 'springrain', name: '春雨', weight: 7, kind: 'good', seasonsOnly: [0],
    msg: '好雨知时节，今季农田 +20%。',
    apply(g) { g.temp.farmBoost = Math.max(g.temp.farmBoost, 1.2); g.temp.farmBoostDays = SEASON_LEN; } },
  { id: 'autumnsky', name: '秋高气爽', weight: 6, kind: 'good', seasonsOnly: [2],
    msg: '天高云淡，人心舒畅。',
    apply(g) { g.addHapTemp(6, 15); } },
  { id: 'drought', name: '大旱', weight: 5, kind: 'bad', minYear: 3,
    msg: '赤日炎炎，河床见底，农田减产。',
    apply(g) { g.temp.farmBoost = 0.6; g.temp.farmBoostDays = SEASON_LEN; g.addHapTemp(-4, 15); } },
  { id: 'wedding', name: '喜事临门', weight: 7, kind: 'good',
    msg: '镇上喜气洋洋，人口增长加快。',
    apply(g) { g.temp.wedding = 30; } },
];

// ---------- 任务链 ----------
export const QUESTS = [
  { id: 'q1',  name: '筚路蓝缕', desc: '铺设 8 段道路', rewardText: '银 +40',
    check: g => g.roadCount() >= 8, reward: { silver: 40 } },
  { id: 'q2',  name: '安居', desc: '建起 3 座草屋', rewardText: '银 +60',
    check: g => g.count('hut') >= 3, reward: { silver: 60 } },
  { id: 'q3',  name: '开垦', desc: '沃土上开 2 块农田', rewardText: '木 +50',
    check: g => g.count('farm') >= 2, reward: { wood: 50 } },
  { id: 'q4',  name: '仓廪实', desc: '建粮仓，且储粮达 150', rewardText: '银 +80',
    check: g => g.count('granary') >= 1 && g.res.food >= 150, reward: { silver: 80 } },
  { id: 'q5',  name: '饮水思源', desc: '打一口水井', rewardText: '石 +30',
    check: g => g.count('well') >= 1, reward: { stone: 30 } },
  { id: 'q6',  name: '十户人家', desc: '人口达到 30', rewardText: '银 +60',
    check: g => g.pop >= 30, reward: { silver: 60 } },
  { id: 'q7',  name: '百味集市', desc: '建一座集市', rewardText: '银 +100',
    check: g => g.count('market') >= 1, reward: { silver: 100 } },
  { id: 'q8',  name: '工欲善其事', desc: '建木匠坊，囤工具 10 件', rewardText: '银 +100',
    check: g => g.count('carpenter') >= 1 && g.res.tools >= 10, reward: { silver: 100 } },
  { id: 'q9',  name: '开蒙', desc: '建一座书院', rewardText: '研究点 +30',
    check: g => g.count('academy') >= 1, reward: { rp: 30 } },
  { id: 'q10', name: '洛阳纸贵', desc: '研习「造纸」科技', rewardText: '银 +80',
    check: g => g.techs.has('papermaking'), reward: { silver: 80 } },
  { id: 'q11', name: '小有名气', desc: '人口 80 且幸福 ≥60', rewardText: '银 +150',
    check: g => g.pop >= 80 && g.hap >= 60, reward: { silver: 150 } },
  { id: 'q12', name: '通商之路', desc: '建商行，累计贸易额 300 银', rewardText: '银 +120',
    check: g => g.count('tradehouse') >= 1 && g.stats.traded >= 300, reward: { silver: 120 } },
  { id: 'q13', name: '江南名镇', desc: '人口 150 且幸福 ≥70', rewardText: '金印「桃源」+ 焰火',
    check: g => g.pop >= 150 && g.hap >= 70, reward: { silver: 500 }, final: true },
];

// ---------- 成就 ----------
export const ACHIEVEMENTS = [
  { id: 'a_first',   name: '初来乍到', desc: '落成第一座建筑', check: g => g.stats.built >= 1 },
  { id: 'a_pop50',   name: '烟火渐起', desc: '人口达到 50',   check: g => g.pop >= 50 },
  { id: 'a_pop100',  name: '百户之邑', desc: '人口达到 100',  check: g => g.pop >= 100 },
  { id: 'a_pop200',  name: '人烟辐辏', desc: '人口达到 200',  check: g => g.pop >= 200 },
  { id: 'a_pop300',  name: '东南名都会', desc: '人口达到 300', check: g => g.pop >= 300 },
  { id: 'a_food500', name: '五谷丰登', desc: '储粮 500',      check: g => g.res.food >= 500 },
  { id: 'a_silver3k',name: '富甲一方', desc: '白银 3000 两',  check: g => g.silver >= 3000 },
  { id: 'a_tech3',   name: '格物致知', desc: '研成 3 项科技', check: g => g.techs.size >= 3 },
  { id: 'a_tech6',   name: '学究天人', desc: '研成 6 项科技', check: g => g.techs.size >= 6 },
  { id: 'a_techall', name: '百家争鸣', desc: '研成全部科技',  check: g => g.techs.size >= TECHS.length },
  { id: 'a_b50',     name: '营造大师', desc: '落成 50 座建筑（含道路）', check: g => g.stats.built >= 50 },
  { id: 'a_b120',    name: '百年营造', desc: '落成 120 座建筑（含道路）', check: g => g.stats.built >= 120 },
  { id: 'a_hap85',   name: '安居乐业', desc: '幸福 ≥85 且人口 ≥80', check: g => g.hap >= 85 && g.pop >= 80 },
  { id: 'a_year',    name: '四季平安', desc: '安然度过一整年', check: g => g.year >= 2 },
  { id: 'a_wealth',  name: '殷实之家', desc: '各类物资储量均过半仓', check: g => RES_ORDER.every(k => g.res[k] >= g.capOf(k) * 0.5) },
  { id: 'a_peach',   name: '世外桃源', desc: '人口 200 且幸福 ≥80', check: g => g.pop >= 200 && g.hap >= 80 },
];

// ---------- 平衡辅助 ----------
export function taxIncome(pop, taxLevel, techs) {
  let v = pop * TAX_PER_CAPITA * TAX_LEVELS[taxLevel].mult;
  if (techs.has('astronomy')) v *= 1.2;
  return v;
}
