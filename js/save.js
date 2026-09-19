// 存档：localStorage 三槽位 + 自动存档 + 文件导出/导入
import { bus } from './game.js';

const KEY = (slot) => `ink-jiangnan-save-${slot}`;
export const SLOTS = ['auto', 1, 2, 3];

export function saveGame(game, slot) {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(game.toJSON()));
    return true;
  } catch (e) { console.warn('存档失败', e); return false; }
}

export function loadSlot(slot) {
  try {
    const raw = localStorage.getItem(KEY(slot));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function slotInfo(slot) {
  const d = loadSlot(slot);
  if (!d) return null;
  return { day: d.day, pop: Math.floor(d.pop), silver: Math.round(d.silver), year: Math.floor(d.day / 60) + 1 };
}

export function deleteSlot(slot) { localStorage.removeItem(KEY(slot)); }

export function exportFile(game) {
  const blob = new Blob([JSON.stringify(game.toJSON())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `纸上江南存档-第${game.year}年.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function importFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try { resolve(JSON.parse(r.result)); } catch (e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsText(file);
  });
}

// 每年自动存档 + 页面隐藏时
export function setupAutosave(getGame) {
  bus.addEventListener('tick', (e) => {
    if (e.detail % 60 === 0) saveGame(getGame(), 'auto');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame(getGame(), 'auto');
  });
}
