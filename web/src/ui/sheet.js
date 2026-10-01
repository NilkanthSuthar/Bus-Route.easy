// The draggable bottom sheet used on phones. Drag the handle or the search
// area; it snaps to collapsed (just the search bar), half or full height.

export const SIZES = ['min', 'half', 'full'];

// A flick faster than this (px per ms) moves one size in its direction.
const FLICK = 0.4;
// Movement before a press counts as a drag rather than a tap.
const DRAG_THRESHOLD = 6;

export function sheetHeights(viewportHeight, minHeight) {
  const full = viewportHeight - 56;
  const half = Math.max(minHeight + 120, Math.round(viewportHeight * 0.48));
  return { min: minHeight, half: Math.min(half, full), full };
}

/** Picks where to settle after a drag. `velocity` > 0 means growing. */
export function snapSize(heights, height, velocity) {
  const order = SIZES.map((size) => ({ size, h: heights[size] }));
  if (Math.abs(velocity) > FLICK) {
    const next =
      velocity > 0 ? order.find((o) => o.h > height + 1) : [...order].reverse().find((o) => o.h < height - 1);
    if (next) return next.size;
  }
  return order.reduce((best, o) => (Math.abs(o.h - height) < Math.abs(best.h - height) ? o : best)).size;
}

/** What a tap on the handle does: open up, or drop back to half from full. */
export const tapSize = (size) => (size === 'full' ? 'half' : 'full');

export function createSheet(panel, { handle, dragArea, isActive, onSettle }) {
  let size = panel.dataset.size || 'half';
  let drag = null;

  const minHeight = () => handle.offsetHeight + dragArea.offsetHeight + 8;
  const heights = () => sheetHeights(window.innerHeight, minHeight());

  function apply() {
    if (!isActive()) {
      panel.style.height = '';
      document.documentElement.style.removeProperty('--sheet-h');
      return;
    }
    const h = heights()[size];
    panel.style.height = `${h}px`;
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
  }

  function set(next) {
    size = next;
    panel.dataset.size = next;
    handle.setAttribute('aria-label', next === 'full' ? 'Collapse panel' : 'Expand panel');
    apply();
    onSettle?.(next);
  }

  function onDown(e) {
    if (!isActive() || e.button > 0 || e.target.closest('a, button:not(.sheet-handle)')) return;
    drag = { startY: e.clientY, startH: panel.offsetHeight, moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0, id: e.pointerId };
    // Follow the pointer anywhere on screen; a fast drag leaves the handle at once.
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.startY - e.clientY;
    if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      panel.classList.add('dragging');
    }
    const { min, full } = heights();
    const h = Math.min(full, Math.max(min, drag.startH + dy));
    panel.style.height = `${h}px`;
    document.documentElement.style.setProperty('--sheet-h', `${h}px`);
    const dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = (drag.lastY - e.clientY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    e.preventDefault();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const { moved, v } = drag;
    drag = null;
    panel.classList.remove('dragging');
    if (moved) set(snapSize(heights(), panel.offsetHeight, v));
    else if (e.target.closest('.sheet-handle')) set(tapSize(size));
  }

  for (const el of [handle, dragArea]) el.addEventListener('pointerdown', onDown);
  window.addEventListener('resize', apply);
  apply();

  return {
    set,
    get size() {
      return size;
    },
    /** Height the sheet is at or animating to, for fitting the map around it. */
    targetHeight: () => (isActive() ? heights()[size] : 0),
  };
}
