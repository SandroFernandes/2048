/**
 * Local persistence. Everything lives under a single localStorage key and is
 * validated on load, so corrupted or outdated data can never crash the game.
 */
import { DEFAULT_SIZE, DEFAULT_TARGET, SIZES, TARGETS, normalizeState } from './game.js';

export const STORAGE_KEY = 'tessera:v1';
export const MAX_HISTORY = 20;
export const THEMES = Object.freeze(['auto', 'light', 'dark']);

export const DEFAULT_SETTINGS = Object.freeze({
  target: DEFAULT_TARGET,
  size: DEFAULT_SIZE,
  sound: false,
  vibration: false,
  theme: 'auto',
});

export function bestKey(size, target) {
  return `${size}x${size}:${target}`;
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** localStorage when usable, otherwise an in-memory fallback (e.g. blocked storage). */
export function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__tessera_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage();
  }
}

export function emptyData() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, best: {}, game: null, history: [] };
}

export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    target: TARGETS.includes(s.target) ? s.target : DEFAULT_SETTINGS.target,
    size: SIZES.includes(s.size) ? s.size : DEFAULT_SETTINGS.size,
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    vibration: typeof s.vibration === 'boolean' ? s.vibration : DEFAULT_SETTINGS.vibration,
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
  };
}

export function sanitizeBest(raw) {
  const best = {};
  if (!raw || typeof raw !== 'object') return best;
  for (const size of SIZES) {
    for (const target of TARGETS) {
      const key = bestKey(size, target);
      const value = raw[key];
      if (Number.isInteger(value) && value > 0) best[key] = value;
    }
  }
  return best;
}

export function sanitizeData(raw) {
  if (!raw || typeof raw !== 'object') return emptyData();
  const settings = sanitizeSettings(raw.settings);
  const best = sanitizeBest(raw.best);
  const game = normalizeState(raw.game);
  let history = [];
  if (game && Array.isArray(raw.history)) {
    history = raw.history
      .map(normalizeState)
      .filter((s) => s && s.size === game.size)
      .slice(-MAX_HISTORY);
  }
  if (game) {
    settings.size = game.size;
    settings.target = game.target;
    const key = bestKey(game.size, game.target);
    if (game.score > (best[key] || 0)) best[key] = game.score;
  }
  return { version: 1, settings, best, game, history };
}

export function createStore(storage = defaultStorage(), key = STORAGE_KEY) {
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        return raw ? sanitizeData(JSON.parse(raw)) : emptyData();
      } catch {
        return emptyData();
      }
    },
    save(data) {
      try {
        const payload = {
          version: 1,
          settings: data.settings,
          best: data.best,
          game: data.game,
          history: (data.history || []).slice(-MAX_HISTORY),
        };
        storage.setItem(key, JSON.stringify(payload));
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try { storage.removeItem(key); } catch { /* storage unavailable */ }
    },
  };
}
