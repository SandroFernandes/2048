import { newGameState } from '../public/js/game.js';

/** Builds a state from a matrix of numbers (0 = empty). */
export function stateFrom(matrix, extra = {}) {
  const size = matrix.length;
  const base = newGameState({ size, target: extra.target ?? 2048 });
  let id = 1;
  const grid = matrix.map((row) => row.map((v) => (v ? { id: id++, value: v } : null)));
  return { ...base, grid, nextId: id, ...extra };
}

export function values(state) {
  return state.grid.map((row) => row.map((t) => (t ? t.value : 0)));
}

/** Values with the freshly spawned tile removed, to check pure slide results. */
export function valuesWithoutSpawn(result) {
  const v = values(result.state);
  if (result.spawned) v[result.spawned.row][result.spawned.col] = 0;
  return v;
}

/** Deterministic PRNG (mulberry32). */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** rng that always returns the given value. */
export const constant = (v) => () => v;
