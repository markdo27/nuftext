import { autoBrushAt, clamp } from './math.js';

const IDLE_RESUME_MS = 1500;

export class HeatInteraction {
  constructor(canvas, cursorRing) {
    this.canvas = canvas;
    this.cursorRing = cursorRing;
    this.bounds = { left: 0.12, right: 0.88, top: 0.28, bottom: 0.72 };
    this.pointer = { x: 0.5, y: 0.5 };
    this.previous = { ...this.pointer };
    this.pointerActive = false;
    this.manualUntil = 0;
    this.autoStart = performance.now();
    this.attachEvents();
  }

  attachEvents() {
    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture?.(event.pointerId);
      this.pointerActive = true;
      this.readPointer(event);
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
    this.manualUntil = performance.now() + IDLE_RESUME_MS;
    this.cursorRing.style.left = `${event.clientX - rect.left}px`;
    this.cursorRing.style.top = `${event.clientY - rect.top}px`;
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  resetClock() {
    this.autoStart = performance.now();
    this.previous = { x: this.bounds.left, y: (this.bounds.top + this.bounds.bottom) * 0.5 };
  }

  updateCursorSize(state) {
    const diameter = this.canvas.getBoundingClientRect().height * state.brushSize * 2;
    this.cursorRing.style.width = `${diameter}px`;
    this.cursorRing.style.height = `${diameter}px`;
  }

  next(now, state) {
    const pointerOverridesAuto = this.pointerActive && now < this.manualUntil;
    const useAuto = state.mode === 'auto' && !pointerOverridesAuto;
    const current = useAuto
      ? autoBrushAt((now - this.autoStart) / 1000, this.bounds, state.autoSpeed, state.wobble)
      : this.pointer;
    const active = useAuto || this.pointerActive;
    const result = { from: this.previous, to: current, active };
    this.previous = current;
    return result;
  }
}
