/**
 * Pure game logic. No DOM, no storage, no timers.
 *
 * A state is a plain, JSON-serialisable object:
 * {
 *   size, target,                 // grid size and victory target
 *   grid: (Tile|null)[][],        // grid[row][col], Tile = { id, value }
 *   score, moves, nextId,
 *   won,                          // the target has been reached at least once
 *   keepPlaying,                  // the player chose to continue in Endless Mode
 *   over                          // no legal moves remain
 * }
 *
 * Functions never mutate their input; they return new objects.
 */

export const TARGETS = Object.freeze([1024, 2048, 4096]);
export const SIZES = Object.freeze([3, 4, 5, 6]);
export const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);
export const DEFAULT_SIZE = 4;
export const DEFAULT_TARGET = 2048;
export const FOUR_PROBABILITY = 0.1;

export function emptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneGrid(grid) {
  return grid.map((row) => row.map((tile) => (tile ? { id: tile.id, value: tile.value } : null)));
}

export function emptyCells(grid) {
  const cells = [];
  grid.forEach((row, r) => row.forEach((tile, c) => { if (!tile) cells.push({ row: r, col: c }); }));
  return cells;
}

export function maxTile(grid) {
  let max = 0;
  for (const row of grid) for (const tile of row) if (tile && tile.value > max) max = tile.value;
  return max;
}

export function newGameState({ size = DEFAULT_SIZE, target = DEFAULT_TARGET } = {}) {
  if (!SIZES.includes(size)) throw new RangeError(`Unsupported grid size: ${size}`);
  if (!TARGETS.includes(target)) throw new RangeError(`Unsupported target: ${target}`);
  return {
    size,
    target,
    grid: emptyGrid(size),
    score: 0,
    moves: 0,
    nextId: 1,
    won: false,
    keepPlaying: false,
    over: false,
  };
}

/** A fresh game with two starting tiles. */
export function createGame({ size = DEFAULT_SIZE, target = DEFAULT_TARGET, rng = Math.random } = {}) {
  let state = newGameState({ size, target });
  state = addRandomTile(state, rng).state;
  state = addRandomTile(state, rng).state;
  return state;
}

/** Places a 2 (90%) or 4 (10%) in a uniformly chosen empty cell. */
export function addRandomTile(state, rng = Math.random) {
  const cells = emptyCells(state.grid);
  if (cells.length === 0) return { state, tile: null };
  const index = Math.min(cells.length - 1, Math.floor(rng() * cells.length));
  const { row, col } = cells[index];
  const value = rng() < FOUR_PROBABILITY ? 4 : 2;
  const tile = { id: state.nextId, value };
  const grid = cloneGrid(state.grid);
  grid[row][col] = tile;
  return { state: { ...state, grid, nextId: state.nextId + 1 }, tile: { ...tile, row, col } };
}

/**
 * Slides one line of tiles towards index 0 and merges equal neighbours.
 * Merging is resolved from the leading edge and every tile merges at most
 * once, so [2,2,2,2] -> [4,4,_,_] and [4,4,8,8] -> [8,16,_,_].
 */
export function slideLine(tiles, nextId = 1) {
  const compact = tiles.filter(Boolean);
  const line = [];
  const merges = [];
  let gained = 0;
  let id = nextId;

  for (let i = 0; i < compact.length; i += 1) {
    const current = compact[i];
    const following = compact[i + 1];
    if (following && following.value === current.value) {
      const merged = { id: id++, value: current.value * 2 };
      merges.push({ index: line.length, tile: merged, from: [current.id, following.id] });
      line.push(merged);
      gained += merged.value;
      i += 1;
    } else {
      line.push(current);
    }
  }
  while (line.length < tiles.length) line.push(null);
  return { line, gained, merges, nextId: id };
}

/** Convenience wrapper over slideLine for plain numbers (0 = empty). */
export function mergeLine(values) {
  const tiles = values.map((value, i) => (value ? { id: i + 1, value } : null));
  const { line, gained } = slideLine(tiles, values.length + 1);
  return { line: line.map((tile) => (tile ? tile.value : 0)), score: gained };
}

/** Cell coordinates of line `index`, ordered from the edge tiles move towards. */
export function lineCoords(size, direction, index) {
  const coords = [];
  for (let k = 0; k < size; k += 1) {
    switch (direction) {
      case 'left': coords.push([index, k]); break;
      case 'right': coords.push([index, size - 1 - k]); break;
      case 'up': coords.push([k, index]); break;
      case 'down': coords.push([size - 1 - k, index]); break;
      default: throw new RangeError(`Unknown direction: ${direction}`);
    }
  }
  return coords;
}

export function canMove(grid) {
  const size = grid.length;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const tile = grid[r][c];
      if (!tile) return true;
      if (c + 1 < size && grid[r][c + 1] && grid[r][c + 1].value === tile.value) return true;
      if (r + 1 < size && grid[r + 1][c] && grid[r + 1][c].value === tile.value) return true;
    }
  }
  return false;
}

/**
 * Applies a move. Invalid moves (nothing slides or merges) return the
 * original state untouched: no new tile, no score change.
 */
export function move(state, direction, rng = Math.random) {
  if (!DIRECTIONS.includes(direction)) throw new RangeError(`Unknown direction: ${direction}`);
  const noop = { state, moved: false, gained: 0, merges: [], spawned: null, won: false, over: state.over };
  if (state.over) return noop;

  const size = state.size;
  const grid = emptyGrid(size);
  const merges = [];
  let nextId = state.nextId;
  let gained = 0;
  let moved = false;

  for (let i = 0; i < size; i += 1) {
    const coords = lineCoords(size, direction, i);
    const tiles = coords.map(([r, c]) => state.grid[r][c]);
    const result = slideLine(tiles, nextId);
    nextId = result.nextId;
    gained += result.gained;
    result.line.forEach((tile, k) => {
      const [r, c] = coords[k];
      grid[r][c] = tile;
      if ((tile ? tile.id : 0) !== (tiles[k] ? tiles[k].id : 0)) moved = true;
    });
    result.merges.forEach((m) => {
      const [r, c] = coords[m.index];
      merges.push({ id: m.tile.id, value: m.tile.value, from: m.from, row: r, col: c });
    });
  }

  if (!moved) return noop;

  const afterSlide = { ...state, grid, nextId, score: state.score + gained, moves: state.moves + 1 };
  const spawn = addRandomTile(afterSlide, rng);
  const next = { ...spawn.state };

  let justWon = false;
  if (!next.won && maxTile(next.grid) >= next.target) {
    next.won = true;
    justWon = true;
  }
  next.over = !canMove(next.grid);

  return { state: next, moved: true, gained, merges, spawned: spawn.tile, won: justWon, over: next.over };
}

/** Whether the game should show the victory screen. */
export function isVictoryPending(state) {
  return state.won && !state.keepPlaying;
}

/** Continue after victory (Endless Mode). */
export function continueEndless(state) {
  return { ...state, won: true, keepPlaying: true };
}

/**
 * Changes the target while keeping the board. If the board already holds a
 * tile at or above the new target, it counts as passed (no victory popup).
 */
export function setTarget(state, target) {
  if (!TARGETS.includes(target)) throw new RangeError(`Unsupported target: ${target}`);
  const passed = maxTile(state.grid) >= target;
  return { ...state, target, won: passed, keepPlaying: passed };
}

export function isInProgress(state) {
  return state.moves > 0 && !state.over;
}

const isPowerOfTwo = (n) => Number.isInteger(n) && n >= 2 && (n & (n - 1)) === 0;
const isNonNegInt = (n) => Number.isInteger(n) && n >= 0;

/**
 * Validates an untrusted object (e.g. loaded from storage) and returns a
 * clean state, or null if it cannot be used safely.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { size, target, grid } = raw;
  if (!SIZES.includes(size) || !TARGETS.includes(target)) return null;
  if (!Array.isArray(grid) || grid.length !== size) return null;

  const ids = new Set();
  let maxId = 0;
  const clean = [];
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== size) return null;
    const cleanRow = [];
    for (const cell of row) {
      if (cell === null) { cleanRow.push(null); continue; }
      if (!cell || typeof cell !== 'object') return null;
      const { id, value } = cell;
      if (!Number.isInteger(id) || id < 1 || ids.has(id) || !isPowerOfTwo(value)) return null;
      ids.add(id);
      maxId = Math.max(maxId, id);
      cleanRow.push({ id, value });
    }
    clean.push(cleanRow);
  }

  const score = isNonNegInt(raw.score) ? raw.score : 0;
  const moves = isNonNegInt(raw.moves) ? raw.moves : 0;
  const nextId = Number.isInteger(raw.nextId) && raw.nextId > maxId ? raw.nextId : maxId + 1;
  const won = Boolean(raw.won) || maxTile(clean) >= target;
  const keepPlaying = won && Boolean(raw.keepPlaying);

  return { size, target, grid: clean, score, moves, nextId, won, keepPlaying, over: !canMove(clean) };
}
