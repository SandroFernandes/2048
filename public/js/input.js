/**
 * Keyboard and swipe input. Emits abstract commands; knows nothing about rules.
 */

const KEY_DIRECTIONS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
};

function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  return el.closest('input, select, textarea, [contenteditable="true"]') !== null;
}

function isDialogOpen() {
  return document.querySelector('dialog[open]') !== null;
}

/**
 * @param {object} handlers { move(direction), undo(), newGame() }
 */
export function bindKeyboard(handlers) {
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || isDialogOpen() || isTypingTarget(event.target)) return;

    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      handlers.undo();
      return;
    }
    if (mod || event.altKey) return;

    const direction = KEY_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      handlers.move(direction);
      return;
    }
    if (event.key === 'u' || event.key === 'U') { handlers.undo(); return; }
    if (event.key === 'n' || event.key === 'N') { handlers.newGame(); }
  });
}

/**
 * Swipe (touch, pen and mouse drag) on the board element. The board has
 * `touch-action: none`, so the page never scrolls while swiping on it, while
 * the rest of the page scrolls normally.
 */
export function bindSwipe(element, onMove, { ignore } = {}) {
  let start = null;

  element.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (ignore && ignore(event)) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId, t: event.timeStamp };
    try { element.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
  });

  const finish = (event) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = Math.max(20, Math.min(48, element.clientWidth * 0.06));
    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) onMove(dx > 0 ? 'right' : 'left');
    else onMove(dy > 0 ? 'down' : 'up');
  };

  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', () => { start = null; });

  // iOS Safari fallback: make sure a swipe on the board never scrolls or zooms the page.
  element.addEventListener('touchmove', (event) => {
    if (ignore && ignore(event)) return;
    event.preventDefault();
  }, { passive: false });
}
