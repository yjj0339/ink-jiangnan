// 工具库：随机数 / 噪声 / 数学辅助

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 值噪声 [0,1]
export function makeNoise(seed) {
  return function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

export function fbm(noise, x, y, oct = 4, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const idx = (x, y, W) => y * W + x;

export function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 数字格式：12345 -> 1.2万
export function fmt(n) {
  if (n == null || !isFinite(n)) return '0';
  const s = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 10000) return s + (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return s + Math.round(n).toLocaleString('en-US');
  if (n >= 100) return s + Math.round(n);
  return s + (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
}

// 每日增量格式：+3.2 / -1.5
export function fmtRate(n) {
  if (!isFinite(n)) return '';
  const v = Math.round(n * 10) / 10;
  if (Math.abs(v) < 0.05) return '';
  return (v > 0 ? '+' : '') + v;
}
