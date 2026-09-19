// 程序化山水地图：河流游走 + 沃土沿河 + 林地噪声 + 岩矿成簇，资源不足自动换种子
import { W, H, TERRAIN } from './config.js';
import { mulberry32, makeNoise, fbm, idx } from './util.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generateMap(seed) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = tryGen(seed + attempt * 7919);
    if (m) { m.attempt = attempt; return m; }
  }
  return tryGen(seed) || tryGen(1);
}

function tryGen(seed) {
  const rand = mulberry32(seed);
  const nMoist = makeNoise(seed + 11), nElev = makeNoise(seed + 37), nForest = makeNoise(seed + 71), nOre = makeNoise(seed + 113);
  const terrain = new Uint8Array(W * H);
  const tree = new Float32Array(W * H);       // 林木密度 0..1
  const forestNear = new Float32Array(W * H); // 伐木加成 0..1

  // --- 河流：自西向东游走 ---
  let yf = 8 + rand() * (H - 16), dir = 0;
  const water = new Set();
  for (let x = 0; x < W; x++) {
    dir += (rand() - 0.5) * 1.1;
    dir = Math.max(-0.85, Math.min(0.85, dir));
    yf += dir;
    if (yf < 4) { yf = 4; dir = Math.abs(dir); }
    if (yf > H - 5) { yf = H - 5; dir = -Math.abs(dir); }
    const cy = Math.round(yf);
    const half = rand() < 0.3 ? 1 : 0; // 局部加宽
    for (let dy = -half; dy <= 1 + half; dy++) {
      const yy = cy + dy;
      if (yy >= 0 && yy < H) water.add(idx(x, yy, W));
    }
  }
  // --- 池塘 1~2 处 ---
  const ponds = 1 + Math.floor(rand() * 2);
  for (let p = 0; p < ponds; p++) {
    const px = 6 + Math.floor(rand() * (W - 12)), py = 6 + Math.floor(rand() * (H - 12));
    const rx = 1.5 + rand() * 1.8, ry = 1.5 + rand() * 1.8;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - px) / rx, dy = (y - py) / ry;
      if (dx * dx + dy * dy < 1) water.add(idx(x, y, W));
    }
  }
  for (const i of water) terrain[i] = TERRAIN.WATER;

  // --- 距水 BFS（码头/洪水/临水加成用） ---
  const distWater = new Int16Array(W * H).fill(99);
  let queue = [];
  for (const i of water) { distWater[i] = 0; queue.push(i); }
  while (queue.length) {
    const next = [];
    for (const i of queue) {
      const x = i % W, y = (i / W) | 0, d = distWater[i];
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny, W);
        if (distWater[j] > d + 1) { distWater[j] = d + 1; next.push(j); }
      }
    }
    queue = next;
  }

  // --- 地形分类 ---
  let fertileCount = 0, forestCount = 0, rockCount = 0, oreCount = 0;
  const oreTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y, W);
    if (terrain[i] === TERRAIN.WATER) continue;
    const moist = fbm(nMoist, x * 0.09, y * 0.09, 4);
    const elev = fbm(nElev, x * 0.085 + 40, y * 0.085 + 40, 4);
    const fo = fbm(nForest, x * 0.11 + 80, y * 0.11 + 80, 4);
    if (elev > 0.68) {
      terrain[i] = TERRAIN.ROCK; rockCount++;
      if (nOre(x * 0.23, y * 0.23) > 0.78) { terrain[i] = TERRAIN.ORE; oreCount++; oreTiles.push(i); }
    } else if (distWater[i] >= 1 && distWater[i] <= 5 && moist > 0.56) {
      terrain[i] = TERRAIN.FERTILE; fertileCount++;
    } else if (fo > 0.60 && elev < 0.62) {
      terrain[i] = TERRAIN.FOREST; forestCount++;
      tree[i] = Math.min(1, (fo - 0.60) * 6 + 0.35);
    }
  }
  // 矿脉太少则在最大的岩坡簇中补几格
  if (oreCount < 6 && rockCount > 10) {
    let added = 0;
    for (let y = 1; y < H - 1 && added < 6 - oreCount; y++) for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y, W);
      if (terrain[i] === TERRAIN.ROCK && nOre(x * 0.23, y * 0.23) > 0.7) {
        terrain[i] = TERRAIN.ORE; oreTiles.push(i); added++;
        if (added >= 6 - oreCount) break;
      }
    }
    oreCount += added;
  }

  // --- 伐木加成：半径2内林地数 ---
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y, W);
    if (terrain[i] === TERRAIN.WATER) continue;
    let c = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && terrain[idx(nx, ny, W)] === TERRAIN.FOREST) c++;
    }
    forestNear[i] = Math.min(1, c / 9);
  }

  // --- 出生点：近河、9×9 无水 ---
  let spawn = null;
  let best = 1e9;
  for (let y = 4; y < H - 12; y++) for (let x = 4; x < W - 12; x++) {
    let ok = true;
    for (let dy = 0; dy < 9 && ok; dy++) for (let dx = 0; dx < 9; dx++) {
      if (terrain[idx(x + dx, y + dy, W)] === TERRAIN.WATER) { ok = false; break; }
    }
    if (!ok) continue;
    const score = Math.abs(distWater[idx(x + 4, y + 4, W)] - 2) * 3 + Math.abs(x - W / 2) * 0.3 + Math.abs(y - H / 2) * 0.3;
    if (score < best) { best = score; spawn = { x: x + 4, y: y + 4 }; }
  }
  if (!spawn) return null;

  // --- 资源保证 ---
  if (fertileCount < 60 || forestCount < 80 || oreCount < 6 || rockCount < 20) return null;
  // 沃土至少有一片在出生点 10 格内
  let fertNear = 0;
  for (let y = spawn.y - 10; y <= spawn.y + 10; y++) for (let x = spawn.x - 10; x <= spawn.x + 10; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (terrain[idx(x, y, W)] === TERRAIN.FERTILE) fertNear++;
  }
  if (fertNear < 12) return null;

  const waterList = [...water];
  return { W, H, seed, terrain, tree, forestNear, distWater, spawn, waterList, waterSet: water };
}
