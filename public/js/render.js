/**
 * DOM rendering for the board. Knows nothing about rules or storage; it only
 * turns a game state (plus an optional move result) into tile elements.
 */

const SUPER_THRESHOLD = 8192;

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function moveDuration() {
  return prefersReducedMotion() ? 0 : 110;
}

export class BoardView {
  constructor({ board, cells, tiles }) {
    this.board = board;
    this.cellsEl = cells;
    this.tilesEl = tiles;
    this.size = 0;
    this.target = 0;
    this.tiles = new Map();
    this.pendingRemoval = [];
    this.pendingTimer = 0;

    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(board);
    } else {
      addEventListener('resize', () => this.measure());
    }
  }

  setSize(size) {
    if (size === this.size) return;
    this.size = size;
    this.board.style.setProperty('--n', String(size));
    this.board.dataset.size = String(size);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < size * size; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      frag.appendChild(cell);
    }
    this.cellsEl.replaceChildren(frag);
    this.measure();
  }

  /** Keeps font size and corner radius proportional to the real tile size. */
  measure() {
    const cell = this.cellsEl.firstElementChild;
    if (!cell) return;
    const px = cell.getBoundingClientRect().width;
    if (!px) return;
    this.board.style.setProperty('--tile-size', `${px.toFixed(2)}px`);
    this.board.style.setProperty('--tile-radius', `${Math.max(6, Math.round(px * 0.17))}px`);
  }

  /** Renders a state without animation (initial load, undo, new game). */
  sync(state) {
    this.flush();
    this.setSize(state.size);
    this.target = state.target;
    this.tiles.forEach((el) => el.remove());
    this.tiles.clear();
    const frag = document.createDocumentFragment();
    forEachTile(state.grid, (tile, row, col) => {
      const el = this.createTile(tile, row, col);
      this.tiles.set(tile.id, el);
      frag.appendChild(el);
    });
    this.tilesEl.replaceChildren(frag);
  }

  /** Animates the transition described by a move result. */
  update(state, result) {
    this.flush();
    this.target = state.target;
    const mergedIds = new Set();

    for (const merge of result.merges) {
      mergedIds.add(merge.id);
      for (const sourceId of merge.from) {
        const el = this.tiles.get(sourceId);
        if (!el) continue;
        setPosition(el, merge.row, merge.col);
        this.tiles.delete(sourceId);
        this.pendingRemoval.push(el);
      }
    }

    const live = new Set();
    forEachTile(state.grid, (tile, row, col) => {
      live.add(tile.id);
      const existing = this.tiles.get(tile.id);
      if (existing) {
        setPosition(existing, row, col);
        return;
      }
      const el = this.createTile(tile, row, col);
      if (mergedIds.has(tile.id)) el.classList.add('is-merged');
      else el.classList.add('is-new');
      this.tiles.set(tile.id, el);
      this.tilesEl.appendChild(el);
    });

    this.tiles.forEach((el, id) => {
      if (!live.has(id)) { el.remove(); this.tiles.delete(id); }
    });

    this.pendingTimer = setTimeout(() => this.flush(), moveDuration() + 20);
  }

  /** Finishes any in-flight animation immediately (e.g. on rapid input). */
  flush() {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = 0;
    this.pendingRemoval.forEach((el) => el.remove());
    this.pendingRemoval = [];
  }

  nudge(direction) {
    if (prefersReducedMotion()) return;
    const cls = `nudge-${direction}`;
    this.board.classList.remove('nudge-left', 'nudge-right', 'nudge-up', 'nudge-down');
    void this.board.offsetWidth;
    this.board.classList.add(cls);
    setTimeout(() => this.board.classList.remove(cls), 200);
  }

  createTile(tile, row, col) {
    const el = document.createElement('div');
    el.className = 'tile';
    setPosition(el, row, col);
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    inner.dataset.v = tile.value >= SUPER_THRESHOLD ? 'super' : String(tile.value);
    inner.dataset.digits = String(String(tile.value).length);
    if (tile.value === this.target) inner.classList.add('is-target');
    inner.textContent = String(tile.value);
    el.appendChild(inner);
    return el;
  }
}

function setPosition(el, row, col) {
  el.style.setProperty('--r', String(row));
  el.style.setProperty('--c', String(col));
}

function forEachTile(grid, fn) {
  grid.forEach((row, r) => row.forEach((tile, c) => { if (tile) fn(tile, r, c); }));
}

/** Plain-language description of the board for screen readers. */
export function describeBoard(state) {
  return state.grid
    .map((row, r) => `Row ${r + 1}: ${row.map((t) => (t ? t.value : 'empty')).join(', ')}.`)
    .join(' ');
}
