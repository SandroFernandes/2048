import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, move } from '../public/js/game.js';
import {
  DEFAULT_SETTINGS, MAX_HISTORY, STORAGE_KEY, bestKey, createStore, emptyData, memoryStorage,
} from '../public/js/storage.js';
import { seeded, stateFrom } from './helpers.js';

function playSome(state, rng, n) {
  const history = [];
  let s = state;
  for (let i = 0; i < n; i += 1) {
    const r = move(s, ['left', 'up', 'right', 'down'][i % 4], rng);
    if (r.moved) { history.push(s); s = r.state; }
  }
  return { state: s, history };
}

describe('state saving and restoration', () => {
  test('empty storage yields defaults', () => {
    const data = createStore(memoryStorage()).load();
    assert.deepEqual(data, emptyData());
    assert.deepEqual(data.settings, { ...DEFAULT_SETTINGS });
    assert.equal(data.settings.sound, false, 'sound is disabled by default');
  });

  test('board, score, undo history, settings and best scores round-trip', () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    const rng = seeded(5);
    const { state, history } = playSome(createGame({ size: 5, target: 4096, rng }), rng, 30);

    const data = {
      ...emptyData(),
      settings: { target: 4096, size: 5, sound: true, vibration: true, theme: 'dark' },
      best: { [bestKey(5, 4096)]: Math.max(state.score, 1), [bestKey(3, 1024)]: 777 },
      game: state,
      history,
    };
    assert.equal(store.save(data), true);

    const restored = createStore(storage).load();
    assert.deepEqual(restored.game, state);
    assert.deepEqual(restored.history, history.slice(-MAX_HISTORY));
    assert.deepEqual(restored.settings, data.settings);
    assert.deepEqual(restored.best, data.best);
  });

  test('victory and Endless Mode flags persist', () => {
    const storage = memoryStorage();
    const game = stateFrom([[2048, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], {
      won: true, keepPlaying: true, moves: 100, score: 20000,
    });
    createStore(storage).save({ ...emptyData(), game });
    const restored = createStore(storage).load().game;
    assert.equal(restored.won, true);
    assert.equal(restored.keepPlaying, true);
  });

  test('best scores are tracked per grid size and target', () => {
    const storage = memoryStorage();
    const game = stateFrom([[2, 0, 0], [0, 0, 0], [0, 0, 0]], { target: 1024, score: 500, moves: 10 });
    createStore(storage).save({ ...emptyData(), game, best: { [bestKey(4, 2048)]: 9000 } });
    const { best, settings } = createStore(storage).load();
    assert.equal(best[bestKey(3, 1024)], 500, 'current score raises the best for its combination');
    assert.equal(best[bestKey(4, 2048)], 9000);
    assert.equal(best[bestKey(3, 2048)], undefined);
    assert.equal(settings.size, 3, 'selected size follows the saved game');
    assert.equal(settings.target, 1024);
  });

  test('undo history is capped', () => {
    const storage = memoryStorage();
    const rng = seeded(11);
    const { state, history } = playSome(createGame({ rng }), rng, 200);
    assert.ok(history.length > MAX_HISTORY);
    createStore(storage).save({ ...emptyData(), game: state, history });
    assert.equal(createStore(storage).load().history.length, MAX_HISTORY);
  });

  test('corrupted JSON falls back to defaults', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    assert.deepEqual(createStore(storage).load(), emptyData());
  });

  test('invalid games, settings and scores are discarded individually', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({
      settings: { target: 999, size: 4, sound: 'yes', vibration: true, theme: 'neon' },
      best: { '4x4:2048': 120, '9x9:2048': 5, '3x3:1024': -3 },
      game: { size: 4, target: 2048, grid: 'broken' },
      history: [{}],
    }));
    const data = createStore(storage).load();
    assert.equal(data.game, null);
    assert.deepEqual(data.history, []);
    assert.deepEqual(data.settings, { ...DEFAULT_SETTINGS, vibration: true });
    assert.deepEqual(data.best, { '4x4:2048': 120 });
  });

  test('history entries from a different grid size are dropped', () => {
    const storage = memoryStorage();
    const game = createGame({ size: 4, rng: seeded(1) });
    const other = createGame({ size: 6, rng: seeded(2) });
    createStore(storage).save({ ...emptyData(), game, history: [other, game] });
    assert.deepEqual(createStore(storage).load().history, [game]);
  });

  test('failing storage never throws', () => {
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('denied'); },
    };
    const store = createStore(broken);
    assert.deepEqual(store.load(), emptyData());
    assert.equal(store.save(emptyData()), false);
    assert.doesNotThrow(() => store.clear());
  });

  test('clear removes all saved data', () => {
    const storage = memoryStorage();
    const store = createStore(storage);
    store.save({ ...emptyData(), game: createGame({ rng: seeded(3) }) });
    store.clear();
    assert.equal(storage.getItem(STORAGE_KEY), null);
    assert.deepEqual(store.load(), emptyData());
  });
});
