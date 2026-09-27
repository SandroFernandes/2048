import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZES, TARGETS, addRandomTile, canMove, continueEndless, createGame, emptyCells,
  isInProgress, isVictoryPending, mergeLine, move, normalizeState, setTarget, slideLine,
} from '../public/js/game.js';
import { constant, seeded, stateFrom, values, valuesWithoutSpawn } from './helpers.js';

describe('merge ordering', () => {
  const cases = [
    [[2, 2, 2, 2], [4, 4, 0, 0], 8],
    [[4, 4, 8, 8], [8, 16, 0, 0], 24],
    [[2, 2, 4, 0], [4, 4, 0, 0], 4],
    [[4, 2, 2, 0], [4, 4, 0, 0], 4],
    [[2, 0, 0, 2], [4, 0, 0, 0], 4],
    [[2, 2, 2, 0], [4, 2, 0, 0], 4],
    [[0, 2, 2, 2], [4, 2, 0, 0], 4],
    [[2, 4, 8, 16], [2, 4, 8, 16], 0],
    [[8, 0, 8, 8], [16, 8, 0, 0], 16],
    [[0, 0, 0, 0], [0, 0, 0, 0], 0],
    [[2, 2, 4, 4, 8, 8], [4, 8, 16, 0, 0, 0], 28],
    [[2, 2, 2], [4, 2, 0], 4],
  ];
  for (const [input, expected, score] of cases) {
    test(`[${input}] -> [${expected}]`, () => {
      assert.deepEqual(mergeLine(input), { line: expected, score });
    });
  }

  test('a tile created by a merge cannot merge again in the same move', () => {
    const { line, merges } = slideLine(
      [{ id: 1, value: 2 }, { id: 2, value: 2 }, { id: 3, value: 4 }, null],
      10,
    );
    assert.deepEqual(line.map((t) => t && t.value), [4, 4, null, null]);
    assert.equal(merges.length, 1);
    assert.deepEqual(merges[0].from, [1, 2]);
    assert.equal(line[1].id, 3, 'the original 4 keeps its identity');
  });
});

describe('movement in all four directions', () => {
  const start = [
    [2, 0, 2, 4],
    [0, 4, 0, 4],
    [2, 2, 2, 2],
    [0, 0, 0, 8],
  ];

  test('left', () => {
    const r = move(stateFrom(start), 'left', constant(0));
    assert.ok(r.moved);
    assert.deepEqual(valuesWithoutSpawn(r), [
      [4, 4, 0, 0],
      [8, 0, 0, 0],
      [4, 4, 0, 0],
      [8, 0, 0, 0],
    ]);
  });

  test('right', () => {
    const r = move(stateFrom(start), 'right', constant(0));
    assert.deepEqual(valuesWithoutSpawn(r), [
      [0, 0, 4, 4],
      [0, 0, 0, 8],
      [0, 0, 4, 4],
      [0, 0, 0, 8],
    ]);
  });

  test('up', () => {
    const r = move(stateFrom(start), 'up', constant(0));
    assert.deepEqual(valuesWithoutSpawn(r), [
      [4, 4, 4, 8],
      [0, 2, 0, 2],
      [0, 0, 0, 8],
      [0, 0, 0, 0],
    ]);
  });

  test('down', () => {
    const r = move(stateFrom(start), 'down', constant(0));
    assert.deepEqual(valuesWithoutSpawn(r), [
      [0, 0, 0, 0],
      [0, 0, 0, 8],
      [0, 4, 0, 2],
      [4, 2, 4, 8],
    ]);
  });

  test('columns resolve merges from the edge they move towards', () => {
    const col = [[2], [2], [2], [2]].map((r) => [r[0], 0, 0, 0]);
    assert.deepEqual(valuesWithoutSpawn(move(stateFrom(col), 'down', constant(0))).map((r) => r[0]), [0, 0, 4, 4]);
    assert.deepEqual(valuesWithoutSpawn(move(stateFrom(col), 'up', constant(0))).map((r) => r[0]), [4, 4, 0, 0]);
  });

  test('unknown direction throws', () => {
    assert.throws(() => move(stateFrom(start), 'diagonal'), RangeError);
  });

  test('the input state is never mutated', () => {
    const s = stateFrom(start);
    const snapshot = JSON.stringify(s);
    move(s, 'left', seeded(3));
    assert.equal(JSON.stringify(s), snapshot);
  });
});

describe('scoring', () => {
  test('score increases by the value of each newly merged tile', () => {
    const s = stateFrom([
      [2, 2, 4, 4],
      [8, 8, 0, 0],
      [0, 0, 0, 0],
      [16, 0, 16, 32],
    ], { score: 100 });
    const r = move(s, 'left', constant(0));
    assert.equal(r.gained, 4 + 8 + 16 + 32);
    assert.equal(r.state.score, 100 + 60);
  });

  test('moves without merges do not change the score', () => {
    const r = move(stateFrom([[0, 2, 0], [0, 0, 4], [0, 0, 0]], { score: 12 }), 'left', constant(0));
    assert.ok(r.moved);
    assert.equal(r.gained, 0);
    assert.equal(r.state.score, 12);
  });

  test('merge events report position and source tiles', () => {
    const s = stateFrom([[0, 2, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const r = move(s, 'right', constant(0.99));
    assert.equal(r.merges.length, 1);
    assert.deepEqual({ ...r.merges[0], id: 0 }, { id: 0, value: 4, from: [2, 1], row: 0, col: 3 });
  });
});

describe('invalid moves', () => {
  const blocked = [
    [2, 4, 8, 16],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  test('return the same state with no new tile and no score change', () => {
    const s = stateFrom(blocked, { score: 40 });
    const r = move(s, 'up', seeded(1));
    assert.equal(r.moved, false);
    assert.equal(r.state, s);
    assert.equal(r.spawned, null);
    assert.equal(r.gained, 0);
    assert.equal(r.state.score, 40);
    assert.equal(emptyCells(r.state.grid).length, 12);
  });

  test('left on a packed row without equal neighbours is invalid', () => {
    assert.equal(move(stateFrom(blocked), 'left').moved, false);
    assert.equal(move(stateFrom(blocked), 'right').moved, false);
    assert.equal(move(stateFrom(blocked), 'down').moved, true);
  });

  test('no move is possible once the game is over', () => {
    const s = stateFrom([[2, 4, 2], [4, 2, 4], [2, 4, 2]], { over: true });
    for (const dir of ['up', 'down', 'left', 'right']) assert.equal(move(s, dir).moved, false);
  });
});

describe('random tile placement', () => {
  test('only ever fills empty cells', () => {
    const rng = seeded(42);
    for (let trial = 0; trial < 300; trial += 1) {
      const matrix = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => (rng() < 0.5 ? 2 : 0)));
      const s = stateFrom(matrix);
      const before = emptyCells(s.grid);
      const { state, tile } = addRandomTile(s, rng);
      if (before.length === 0) {
        assert.equal(tile, null);
        continue;
      }
      assert.ok(before.some((c) => c.row === tile.row && c.col === tile.col), 'placed in an empty cell');
      assert.equal(emptyCells(state.grid).length, before.length - 1);
      assert.deepEqual(state.grid[tile.row][tile.col], { id: tile.id, value: tile.value });
    }
  });

  test('does nothing on a full board', () => {
    const s = stateFrom([[2, 4], [8, 16]].map((r) => [...r, 32]).concat([[64, 128, 256]]));
    const r = addRandomTile(s, seeded(1));
    assert.equal(r.tile, null);
    assert.equal(r.state, s);
  });

  test('spawns a 4 with 10% probability, otherwise a 2', () => {
    const s = stateFrom([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    assert.equal(addRandomTile(s, constant(0.05)).tile.value, 4);
    assert.equal(addRandomTile(s, constant(0.1)).tile.value, 2);
    assert.equal(addRandomTile(s, constant(0.9)).tile.value, 2);

    const rng = seeded(7);
    let fours = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) if (addRandomTile(s, rng).tile.value === 4) fours += 1;
    assert.ok(Math.abs(fours / n - 0.1) < 0.015, `observed ${fours / n}`);
  });

  test('a valid move spawns exactly one tile in a previously empty cell', () => {
    const s = stateFrom([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const r = move(s, 'right', seeded(9));
    const count = values(r.state).flat().filter(Boolean).length;
    assert.equal(count, 2);
    assert.notDeepEqual([r.spawned.row, r.spawned.col], [0, 3]);
  });
});

describe('victory detection', () => {
  for (const target of TARGETS) {
    test(`reaching ${target} wins`, () => {
      const half = target / 2;
      const s = stateFrom([[half, half, 0], [0, 0, 0], [0, 0, 0]], { target });
      const r = move(s, 'left', constant(0.5));
      assert.equal(r.won, true);
      assert.equal(r.state.won, true);
      assert.equal(isVictoryPending(r.state), true);
    });
  }

  test('a lower tile does not win', () => {
    const r = move(stateFrom([[512, 512, 0], [0, 0, 0], [0, 0, 0]], { target: 2048 }), 'left', constant(0.5));
    assert.equal(r.won, false);
    assert.equal(r.state.won, false);
  });

  test('victory is only reported once; Endless Mode continues', () => {
    const s = stateFrom([[1024, 1024, 0, 0], [8, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { target: 2048 });
    const first = move(s, 'left', constant(0.5));
    assert.equal(first.won, true);
    const endless = continueEndless(first.state);
    assert.equal(isVictoryPending(endless), false);
    const second = move(endless, 'right', constant(0.5));
    assert.equal(second.moved, true);
    assert.equal(second.won, false);
    assert.equal(second.state.keepPlaying, true);
  });

  test('changing the target keeps the board and re-evaluates the win state', () => {
    const s = stateFrom([[1024, 2, 0], [0, 0, 0], [0, 0, 0]], { target: 2048, moves: 5, score: 99 });
    const lower = setTarget(s, 1024);
    assert.deepEqual(values(lower), values(s));
    assert.equal(lower.score, 99);
    assert.equal(lower.won, true);
    assert.equal(isVictoryPending(lower), false, 'already passed, no popup');
    const higher = setTarget(lower, 4096);
    assert.equal(higher.won, false);
    assert.throws(() => setTarget(s, 999), RangeError);
  });
});

describe('game-over detection', () => {
  test('a full board without equal neighbours is over', () => {
    const grid = stateFrom([[2, 4, 2], [4, 2, 4], [2, 4, 2]]).grid;
    assert.equal(canMove(grid), false);
  });

  test('a full board with equal neighbours is not over', () => {
    assert.equal(canMove(stateFrom([[2, 4, 2], [4, 4, 8], [2, 8, 2]]).grid), true);
    assert.equal(canMove(stateFrom([[2, 4, 2], [4, 8, 4], [2, 8, 2]]).grid), true);
  });

  test('a board with an empty cell is not over', () => {
    assert.equal(canMove(stateFrom([[2, 4, 2], [4, 0, 4], [2, 4, 2]]).grid), true);
  });

  test('the move that fills the last cell can end the game', () => {
    // After moving left, [4,8,_] gets the spawned tile; rng picks the only empty cell and a 2.
    const s = stateFrom([[0, 4, 8], [8, 16, 32], [64, 128, 256]]);
    const r = move(s, 'left', constant(0.5));
    assert.deepEqual(values(r.state), [[4, 8, 2], [8, 16, 32], [64, 128, 256]]);
    assert.equal(r.over, true);
    assert.equal(r.state.over, true);
    assert.equal(isInProgress(r.state), false);
  });
});

describe('different grid sizes', () => {
  for (const size of SIZES) {
    test(`${size}x${size} starts with two tiles and plays`, () => {
      const rng = seeded(size);
      let s = createGame({ size, target: 2048, rng });
      assert.equal(s.grid.length, size);
      s.grid.forEach((row) => assert.equal(row.length, size));
      assert.equal(values(s).flat().filter(Boolean).length, 2);

      let moves = 0;
      for (let i = 0; i < 400 && !s.over; i += 1) {
        const dir = ['up', 'left', 'down', 'right'][i % 4];
        const r = move(s, dir, rng);
        if (r.moved) {
          moves += 1;
          const tileSum = values(r.state).flat().reduce((a, b) => a + b, 0);
          const prevSum = values(s).flat().reduce((a, b) => a + b, 0);
          assert.equal(tileSum, prevSum + r.spawned.value, 'tile values are conserved');
        }
        s = r.state;
      }
      assert.ok(moves > 0);
      assert.equal(s.moves, moves);
    });
  }

  test('unsupported sizes and targets are rejected', () => {
    assert.throws(() => createGame({ size: 7 }), RangeError);
    assert.throws(() => createGame({ target: 512 }), RangeError);
  });
});

describe('normalizeState', () => {
  test('accepts a valid state and recomputes derived fields', () => {
    const s = stateFrom([[2, 4, 2], [4, 2, 4], [2, 4, 2]], { over: false, moves: 3 });
    const n = normalizeState(JSON.parse(JSON.stringify(s)));
    assert.equal(n.over, true);
    assert.deepEqual(values(n), values(s));
  });

  test('rejects malformed input', () => {
    const good = stateFrom([[2, 0, 0], [0, 0, 0], [0, 0, 0]]);
    assert.equal(normalizeState(null), null);
    assert.equal(normalizeState({ ...good, size: 9 }), null);
    assert.equal(normalizeState({ ...good, target: 3 }), null);
    assert.equal(normalizeState({ ...good, grid: [[1, 2]] }), null);
    const badValue = JSON.parse(JSON.stringify(good));
    badValue.grid[0][0].value = 3;
    assert.equal(normalizeState(badValue), null);
    const dupId = JSON.parse(JSON.stringify(good));
    dupId.grid[1][1] = { ...dupId.grid[0][0] };
    assert.equal(normalizeState(dupId), null);
  });
});
