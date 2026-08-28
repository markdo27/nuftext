import { autoBrushAt, clamp } from './math.js';
import { capsuleBrush, emptyScanTargets, scanBrushes, scanUnits } from './word-scan.js';

const IDLE_RESUME_MS = 1500;

export class HeatInteraction {
  constructor(canvas, cursorRing) {
    this.canvas = canvas;
    this.cursorRing = cursorRing;
    this.bounds = { left: 0.12, right: 0.88, top: 0.28, bottom: 0.72 };
    this.pointer = { x: 0.5, y: 0.5 };
    this.previous = { ...this.pointer };
    this.pointerActive = false;
    this.pointerSeen = false;
    this.releasedAt = 0;
    this.manualUntil = 0;
    this.autoStart = performance.now();
    this.scanTargets = emptyScanTargets();
    this.picked = new Set();
    this.attachEvents();
  }

  attachEvents() {
    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture?.(event.pointerId);
      this.pointerActive = true;
      this.readPointer(event);
      this.pendingPick = { ...this.pointer };
    });
    this.canvas.addEventListener('pointermove', event => {
      const canHover = event.pointerType === 'mouse';
      if (canHover || event.buttons > 0 || this.pointerActive) {
        this.pointerActive = true;
        this.readPointer(event);
      }
    });
    this.canvas.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') {
        this.pointerActive = true;
        this.readPointer(event);
      }
    });
    this.canvas.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse') this.pointerActive = false;
    });
    this.canvas.addEventListener('pointerup', event => {
      if (event.pointerType !== 'mouse') this.pointerActive = false;
    });
    this.canvas.addEventListener('pointercancel', () => { this.pointerActive = false; });
  }

  readPointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height)
    };
    this.pointerSeen = true;
    this.manualUntil = performance.now() + IDLE_RESUME_MS;
    this.cursorRing.style.left = `${event.clientX - rect.left}px`;
    this.cursorRing.style.top = `${event.clientY - rect.top}px`;
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  setLayout(targets) {
    this.scanTargets = targets;
    this.clearPicks();
  }

  clearPicks() {
    this.picked = new Set();
    this.pendingPick = null;
  }

  // Clicking a unit toggles it; clicking empty space leaves the selection be.
  resolvePick(state) {
    const point = this.pendingPick;
    this.pendingPick = null;
    if (!point) return;
    const units = scanUnits(this.scanTargets, state.scanUnit);
    const hit = units.findIndex(box =>
      point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom);
    if (hit < 0) return;
    const picked = new Set(this.picked);
    picked.has(hit) ? picked.delete(hit) : picked.add(hit);
    this.picked = picked;
  }

  pickedBrushes(state) {
    const units = scanUnits(this.scanTargets, state.scanUnit);
    return [...this.picked]
      .filter(index => index < units.length)
      .map(index => capsuleBrush(units[index], state, 1, index));
  }

  resetClock() {
    this.autoStart = performance.now();
    this.previous = { x: this.bounds.left, y: (this.bounds.top + this.bounds.bottom) * 0.5 };
    this.releasedAt = 0;
  }

  updateCursorSize(state) {
    const diameter = this.canvas.getBoundingClientRect().height * state.brushSize * 2;
    this.cursorRing.style.width = `${diameter}px`;
    this.cursorRing.style.height = `${diameter}px`;
  }

  // Returns every capsule to inject this frame.
  next(now, state) {
    // In pick mode the pointer selects rather than paints, so it never takes
    // over the way it does in the other automatic modes.
    if (state.mode === 'words' && state.scanOrder === 'pick') {
      this.resolvePick(state);
      return this.pickedBrushes(state);
    }
    this.pendingPick = null;
    const pointerOverridesAuto = this.pointerActive && now < this.manualUntil;
    const automatic = state.mode !== 'manual' && !pointerOverridesAuto;
    return automatic
      ? this.automaticBrush((now - this.autoStart) / 1000, state)
      : [this.pointerBrush(now, state)];
  }

  automaticBrush(seconds, state) {
    if (state.mode === 'words') return scanBrushes(seconds, this.scanTargets, state);
    const to = autoBrushAt(seconds, this.bounds, state.autoSpeed, state.wobble);
    const from = this.previous;
    this.previous = to;
    return [{ from, to, active: 1, radius: state.brushSize }];
  }

  // Heat keeps feeding the goo for a while after the pointer leaves, so a quick
  // hover still develops into a full blob instead of stopping dead.
  pointerBrush(now, state) {
    if (this.pointerActive) this.releasedAt = 0;
    else if (this.pointerSeen && !this.releasedAt) this.releasedAt = now;
    const sustain = Math.max(state.heatSustain, 0) * 1000;
    const releasedFor = this.releasedAt ? now - this.releasedAt : Infinity;
    const active = this.pointerActive ? 1 : clamp(1 - releasedFor / Math.max(sustain, 0.0001));
    const to = this.pointer;
    const from = this.pointerActive ? this.previous : to;
    this.previous = to;
    return { from, to, active, radius: state.brushSize };
  }
}
