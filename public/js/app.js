/**
 * Application controller: wires game logic, rendering, storage, input and
 * feedback together. All rules live in game.js; all persistence in storage.js.
 */
import {
  continueEndless, createGame, isInProgress, isVictoryPending, maxTile, move, setTarget,
} from './game.js';
import { MAX_HISTORY, bestKey, createStore, emptyData } from './storage.js';
import { BoardView, describeBoard } from './render.js';
import { bindKeyboard, bindSwipe } from './input.js';
import { createHaptics, createSound } from './feedback.js';
import { registerServiceWorker } from './pwa.js';

const $ = (id) => document.getElementById(id);

const ui = {
  board: $('board'),
  score: $('score'),
  scoreDelta: $('score-delta'),
  best: $('best'),
  sizeChip: $('size-chip'),
  sizeChipText: $('size-chip-text'),
  targetChip: $('target-chip'),
  targetChipText: $('target-chip-text'),
  endlessChip: $('endless-chip'),
  undoBtn: $('undo-btn'),
  newBtn: $('new-btn'),
  helpBtn: $('help-btn'),
  settingsBtn: $('settings-btn'),
  boardDesc: $('board-desc'),
  overlay: $('overlay'),
  overlayBadge: $('overlay-badge'),
  overlayTitle: $('overlay-title'),
  overlayText: $('overlay-text'),
  overlayActions: $('overlay-actions'),
  announcer: $('announcer'),
  alert: $('alert'),
  toast: $('toast'),
  toastText: $('toast-text'),
  toastAction: $('toast-action'),
  toastClose: $('toast-close'),
  settingsDialog: $('settings-dialog'),
  settingsForm: $('settings-form'),
  helpDialog: $('help-dialog'),
  confirmDialog: $('confirm-dialog'),
  confirmTitle: $('confirm-title'),
  confirmMessage: $('confirm-message'),
  confirmActions: $('confirm-actions'),
  soundToggle: $('sound-toggle'),
  vibrationToggle: $('vibration-toggle'),
  vibrationDesc: $('vibration-desc'),
  resetBtn: $('reset-btn'),
};

const THEME_COLORS = { light: '#e9efee', dark: '#0f171d' };

const store = createStore();
let data = store.load();
const firstVisit = data.game === null;
let state = data.game ?? createGame({ size: data.settings.size, target: data.settings.target });
let history = data.history;
let overlayKind = null;

const view = new BoardView({ board: ui.board, cells: $('board-cells'), tiles: $('board-tiles') });
const sound = createSound();
const haptics = createHaptics();

/* ---------- Persistence ---------- */

function persist() {
  data.game = state;
  data.history = history;
  data.settings.size = state.size;
  data.settings.target = state.target;
  store.save(data);
}

function recordBest() {
  const key = bestKey(state.size, state.target);
  if (state.score > (data.best[key] || 0)) data.best[key] = state.score;
}

/* ---------- Announcements ---------- */

let politeTimer = 0;
function announce(message, { urgent = false } = {}) {
  const region = urgent ? ui.alert : ui.announcer;
  clearTimeout(politeTimer);
  if (urgent) ui.announcer.textContent = '';
  region.textContent = '';
  // Merges are debounced so rapid moves produce one summary instead of a stream.
  politeTimer = setTimeout(() => { region.textContent = message; }, urgent ? 50 : 650);
}

/* ---------- Rendering ---------- */

const fmt = new Intl.NumberFormat();

function renderHud(delta = 0) {
  ui.score.textContent = fmt.format(state.score);
  ui.best.textContent = fmt.format(Math.max(data.best[bestKey(state.size, state.target)] || 0, state.score));

  if (delta > 0) {
    ui.scoreDelta.textContent = `+${fmt.format(delta)}`;
    ui.scoreDelta.classList.remove('show');
    void ui.scoreDelta.offsetWidth;
    ui.scoreDelta.classList.add('show');
  }

  const n = state.size;
  ui.sizeChipText.textContent = `${n} × ${n}`;
  ui.sizeChip.setAttribute('aria-label', `Grid size ${n} by ${n}. Opens settings.`);
  ui.targetChipText.textContent = `Target ${state.target}`;
  ui.targetChip.setAttribute('aria-label', `Target tile ${state.target}. Opens settings.`);
  ui.endlessChip.hidden = !state.keepPlaying;

  ui.undoBtn.disabled = history.length === 0;
  ui.board.setAttribute('aria-label', `Puzzle board, ${n} by ${n}, target ${state.target}${state.keepPlaying ? ', Endless Mode' : ''}`);
  ui.boardDesc.textContent = describeBoard(state);

  renderOverlay();
}

function button(label, variant, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn btn-${variant}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function renderOverlay() {
  let kind = null;
  if (isVictoryPending(state)) kind = 'win';
  else if (state.over) kind = 'over';

  if (kind === overlayKind) return;
  overlayKind = kind;

  if (!kind) {
    ui.overlay.hidden = true;
    ui.overlayActions.replaceChildren();
    ui.overlayTitle.textContent = '';
    ui.overlayText.textContent = '';
    return;
  }

  ui.overlay.dataset.kind = kind;
  let primary;
  if (kind === 'win') {
    ui.overlayBadge.textContent = String(state.target);
    ui.overlayTitle.textContent = `You made ${state.target}!`;
    ui.overlayText.textContent = `Score ${fmt.format(state.score)}. Keep sliding in Endless Mode to chase a bigger tile, or start fresh.`;
    primary = button('Continue playing', 'primary', () => {
      state = continueEndless(state);
      persist();
      renderHud();
      ui.board.focus({ preventScroll: true });
      announce('Endless Mode. Keep going!');
    });
    ui.overlayActions.replaceChildren(primary, button('New game', 'ghost', () => startNewGame()));
  } else {
    ui.overlayBadge.textContent = String(maxTile(state.grid));
    ui.overlayTitle.textContent = 'No moves left';
    ui.overlayText.textContent = `Final score ${fmt.format(state.score)}. Your biggest tile was ${maxTile(state.grid)}.`;
    primary = button('New game', 'primary', () => startNewGame());
    const actions = [primary];
    if (history.length) actions.unshift(button('Undo last move', 'ghost', undo));
    ui.overlayActions.replaceChildren(...actions);
  }
  ui.overlay.hidden = false;
  requestAnimationFrame(() => primary.focus({ preventScroll: true }));
}

function renderAll() {
  view.sync(state);
  renderHud();
}

/* ---------- Game actions ---------- */

function handleMove(direction) {
  if (isVictoryPending(state) || state.over) return;
  const result = move(state, direction);
  if (!result.moved) {
    view.nudge(direction);
    return;
  }

  history.push(state);
  if (history.length > MAX_HISTORY) history.shift();
  state = result.state;
  recordBest();
  persist();

  view.update(state, result);
  renderHud(result.gained);

  if (result.merges.length) {
    const top = Math.max(...result.merges.map((m) => m.value));
    sound.merge(top);
    haptics.merge();
  } else {
    sound.move();
  }

  if (result.won) {
    sound.win();
    haptics.win();
    announce(`You reached ${state.target}! Score ${state.score}. Continue playing or start a new game.`, { urgent: true });
  } else if (result.over) {
    sound.over();
    haptics.over();
    announce(`Game over. No moves left. Final score ${state.score}.`, { urgent: true });
  } else if (result.merges.length) {
    const values = [...new Set(result.merges.map((m) => m.value))].sort((a, b) => b - a);
    announce(`Merged ${values.join(' and ')}. Score ${state.score}.`);
  }
}

function undo() {
  if (!history.length) return;
  state = history.pop();
  persist();
  renderAll();
  sound.undo();
  ui.board.focus({ preventScroll: true });
  announce(`Move undone. Score ${state.score}.`);
}

function startNewGame({ size = state.size, target = state.target } = {}) {
  state = createGame({ size, target });
  history = [];
  persist();
  renderAll();
  ui.board.focus({ preventScroll: true });
  announce(`New ${size} by ${size} game. Target ${target}.`);
}

async function requestNewGame() {
  if (isInProgress(state)) {
    const choice = await confirmDialog({
      title: 'Start a new game?',
      message: 'Your current board will be replaced. Best scores are kept.',
      actions: [
        { label: 'Keep playing', value: 'cancel', variant: 'ghost', focus: true },
        { label: 'New game', value: 'new', variant: 'primary' },
      ],
    });
    if (choice !== 'new') return;
  }
  startNewGame();
}

function applyTarget(target) {
  state = setTarget(state, target);
  history = history.map((s) => setTarget(s, target));
  recordBest();
  persist();
  renderAll();
  announce(`Target changed to ${target}.`);
}

/* ---------- Dialogs ---------- */

function confirmDialog({ title, message, actions }) {
  return new Promise((resolve) => {
    const dlg = ui.confirmDialog;
    ui.confirmTitle.textContent = title;
    ui.confirmMessage.textContent = message;
    let focusTarget = null;
    const buttons = actions.map((a) => {
      const b = document.createElement('button');
      b.className = `btn btn-${a.variant || 'ghost'}`;
      b.value = a.value;
      b.textContent = a.label;
      if (a.focus) { b.autofocus = true; focusTarget = b; }
      return b;
    });
    ui.confirmActions.replaceChildren(...buttons);
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue || 'cancel'), { once: true });
    dlg.showModal();
    if (focusTarget) focusTarget.focus();
  });
}

function syncSettingsForm() {
  const form = ui.settingsForm;
  form.querySelector(`input[name="target"][value="${state.target}"]`).checked = true;
  form.querySelector(`input[name="size"][value="${state.size}"]`).checked = true;
  form.querySelector(`input[name="theme"][value="${data.settings.theme}"]`).checked = true;
  ui.soundToggle.checked = data.settings.sound;
  ui.vibrationToggle.checked = haptics.supported && data.settings.vibration;
  ui.vibrationToggle.disabled = !haptics.supported;
  if (!haptics.supported) ui.vibrationDesc.textContent = 'Not supported on this device';
}

function openSettings() {
  syncSettingsForm();
  ui.settingsDialog.showModal();
}

async function onTargetChange(target) {
  if (target === state.target) return;
  if (!isInProgress(state)) {
    applyTarget(target);
    return;
  }
  const choice = await confirmDialog({
    title: `Change the target to ${target}?`,
    message: 'Your current board and score will be kept. You can also start a fresh game with the new target instead.',
    actions: [
      { label: 'Cancel', value: 'cancel', variant: 'ghost' },
      { label: 'New game', value: 'new', variant: 'ghost' },
      { label: 'Keep my board', value: 'keep', variant: 'primary', focus: true },
    ],
  });
  if (choice === 'keep') applyTarget(target);
  else if (choice === 'new') startNewGame({ target });
  syncSettingsForm();
}

async function onSizeChange(size) {
  if (size === state.size) return;
  if (isInProgress(state)) {
    const choice = await confirmDialog({
      title: `Start a new ${size} × ${size} game?`,
      message: 'A board can’t be resized, so your current game will be replaced. Best scores for every size are kept.',
      actions: [
        { label: 'Cancel', value: 'cancel', variant: 'ghost', focus: true },
        { label: 'Start new game', value: 'new', variant: 'primary' },
      ],
    });
    if (choice !== 'new') { syncSettingsForm(); return; }
  }
  startNewGame({ size });
  syncSettingsForm();
}

async function onReset() {
  const choice = await confirmDialog({
    title: 'Reset all data?',
    message: 'This permanently erases your current game, undo history, best scores and preferences on this device.',
    actions: [
      { label: 'Cancel', value: 'cancel', variant: 'ghost', focus: true },
      { label: 'Reset everything', value: 'reset', variant: 'danger' },
    ],
  });
  if (choice !== 'reset') return;
  store.clear();
  data = emptyData();
  state = createGame({ size: data.settings.size, target: data.settings.target });
  history = [];
  applyPreferences();
  persist();
  renderAll();
  ui.settingsDialog.close();
  ui.board.focus({ preventScroll: true });
  announce('All data has been reset.', { urgent: true });
}

/* ---------- Preferences ---------- */

function applyTheme() {
  const theme = data.settings.theme;
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.getAttribute('media') || '';
    const natural = media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light;
    meta.setAttribute('content', theme === 'auto' ? natural : THEME_COLORS[theme]);
  });
}

function applyPreferences() {
  applyTheme();
  sound.setEnabled(data.settings.sound);
  haptics.setEnabled(data.settings.vibration);
}

/* ---------- Wiring ---------- */

function bindUi() {
  ui.undoBtn.addEventListener('click', undo);
  ui.newBtn.addEventListener('click', requestNewGame);
  ui.settingsBtn.addEventListener('click', openSettings);
  ui.sizeChip.addEventListener('click', openSettings);
  ui.targetChip.addEventListener('click', openSettings);
  ui.helpBtn.addEventListener('click', () => ui.helpDialog.showModal());

  ui.settingsForm.addEventListener('change', (event) => {
    const input = event.target;
    if (input.name === 'target') onTargetChange(Number(input.value));
    else if (input.name === 'size') onSizeChange(Number(input.value));
    else if (input.name === 'theme') {
      data.settings.theme = input.value;
      applyTheme();
      persist();
    } else if (input === ui.soundToggle) {
      data.settings.sound = input.checked;
      sound.setEnabled(input.checked);
      sound.preview();
      persist();
    } else if (input === ui.vibrationToggle) {
      data.settings.vibration = input.checked;
      haptics.setEnabled(input.checked);
      haptics.merge();
      persist();
    }
  });
  ui.resetBtn.addEventListener('click', onReset);

  // Clicking the dimmed backdrop closes settings and help.
  for (const dlg of [ui.settingsDialog, ui.helpDialog]) {
    dlg.addEventListener('click', (event) => { if (event.target === dlg) dlg.close(); });
  }

  bindKeyboard({ move: handleMove, undo, newGame: requestNewGame });
  bindSwipe(ui.board, handleMove, { ignore: (event) => ui.overlay.contains(event.target) && !ui.overlay.hidden });

  ui.toastClose.addEventListener('click', () => { ui.toast.hidden = true; });
}

function init() {
  data.settings.size = state.size;
  data.settings.target = state.target;
  applyPreferences();
  bindUi();
  renderAll();
  persist();

  registerServiceWorker({
    onUpdateReady(apply) {
      ui.toastText.textContent = 'A new version is ready.';
      ui.toast.hidden = false;
      ui.toastAction.onclick = () => { ui.toast.hidden = true; apply(); };
    },
  });

  if (firstVisit) ui.helpDialog.showModal();
}

init();
