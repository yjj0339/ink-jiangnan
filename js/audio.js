// 轻量 WebAudio 音效：拨弦/叮咚/铜钱声，全部合成，无外部资源
export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  pluck(freq, t = 0, dur = 0.5, vol = 0.16) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t0 = ctx.currentTime + t;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  build() { this.pluck(392, 0, 0.4); this.pluck(523, 0.07, 0.5, 0.12); }
  select() { this.pluck(660, 0, 0.12, 0.06); }
  demolish() { this.pluck(180, 0, 0.25, 0.14); }
  quest() { this.pluck(523, 0, 0.5); this.pluck(659, 0.12, 0.5); this.pluck(784, 0.24, 0.7, 0.18); }
  achv() { this.pluck(587, 0, 0.4); this.pluck(880, 0.1, 0.6, 0.14); }
  coin() { this.pluck(988, 0, 0.2, 0.1); this.pluck(1319, 0.05, 0.25, 0.08); }
  error() { this.pluck(140, 0, 0.3, 0.18); }
  event(good) { if (good) { this.pluck(440, 0, 0.4); this.pluck(554, 0.1, 0.5, 0.1); } else this.pluck(220, 0, 0.5, 0.14); }
}
export const sfx = new Sfx();
