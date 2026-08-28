import test from 'node:test';
import assert from 'node:assert/strict';
import { autoBrushAt, hexToRgb, triangleWave } from '../src/math.js';
import { applyPalette, createState, PALETTES, resetState } from '../src/state.js';
import { encodeGif } from '../src/gif.js';
import { densityAt, densityFromPixels, densityGridSize } from '../src/density.js';
import { emptyScanTargets, scanAt, scanBrush, scanHoldSeconds, scanUnits } from '../src/word-scan.js';

// Two lines, "on y" over "trouve", as normalized word boxes.
function sampleTargets() {
  const words = [
    { left: 0.20, right: 0.44, top: 0.10, bottom: 0.24 },
    { left: 0.48, right: 0.56, top: 0.10, bottom: 0.24 },
    { left: 0.18, right: 0.72, top: 0.30, bottom: 0.44 }
  ];
  const lines = [
    { left: 0.20, right: 0.56, top: 0.10, bottom: 0.24 },
    { left: 0.18, right: 0.72, top: 0.30, bottom: 0.44 }
  ];
  return { words, lines };
}

// A block of ink in the top-left corner and a lighter one in the middle.
function sampleGrid() {
  const columns = 8;
  const rows = 6;
  const pixels = new Uint8Array(columns * rows * 4);
  const set = (column, row, coverage) => { pixels[(row * columns + column) * 4 + 3] = coverage; };
  set(0, 0, 255); set(1, 0, 255); set(0, 1, 255); set(1, 1, 255);
  set(4, 3, 90); set(5, 3, 90);
  return densityFromPixels(pixels, columns, rows);
}

test('triangle wave loops without leaving the unit interval', () => {
  assert.equal(triangleWave(0), 0);
  assert.equal(triangleWave(1), 1);
  assert.equal(triangleWave(2), 0);
  assert.equal(triangleWave(3), 1);
});

test('auto brush remains inside the text bounds', () => {
  const bounds = { left: 0.2, right: 0.8, top: 0.3, bottom: 0.7 };
  for (let time = 0; time < 30; time += 0.1) {
    const brush = autoBrushAt(time, bounds, 1.4, 1);
    assert.ok(brush.x >= bounds.left && brush.x <= bounds.right);
    assert.ok(brush.y >= bounds.top && brush.y <= bounds.bottom);
  }
});

test('hex colours convert to normalized RGB', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [1, 128 / 255, 0]);
});

test('palette changes are copied and reset restores defaults', () => {
  const state = createState();
  assert.equal(state.text, 'Good\nexperiences\ndon’t happen\nby accident.\nThey are\ndesigned.');
  assert.equal(state.fontScale, 1.17);
  assert.equal(state.tracking, -0.08);
  assert.equal(state.leading, 0.78);
  assert.equal(state.brushSize, 0.13);
  assert.equal(state.brushEdgeBlur, 0.97);
  assert.equal(state.heatStrength, 1.5);
  assert.equal(state.heatSustain, 0.05);
  assert.equal(state.trail, 0.95);
  assert.equal(state.autoSpeed, 0.53);
  assert.equal(state.wobble, 0.59);
  assert.equal(state.aspect, 1.7778);
  assert.equal(state.exportHeight, 2400);
  assert.equal(state.duration, 4);
  assert.equal(state.contourWidth, 0.59);
  assert.equal(state.glowRadius, 0.81);
  assert.equal(state.gooAmount, 0.88);
  assert.equal(state.gooSpread, 0.65);
  assert.equal(state.gooViscosity, 0.8);
  assert.equal(state.gooThreshold, 0.62);
  assert.equal(state.gooDissolve, 0.82);
  assert.equal(state.gooRise, 0.05);
  assert.equal(state.gooDwell, 0.2);
  assert.equal(state.densityBias, 0.89);
  assert.equal(state.coreColorization, 0);
  assert.equal(state.effectIntensity, 1.13);
  assert.equal(state.paletteName, 'acid');
  assert.deepEqual(state.palette, PALETTES.acid);
  applyPalette(state, 'cyanPink');
  state.palette[0] = '#000000';
  assert.notEqual(PALETTES.cyanPink[0], '#000000');
  resetState(state);
  assert.equal(state.paletteName, 'acid');
  assert.deepEqual(state.palette, PALETTES.acid);
});

test('GIF encoder emits a complete GIF89a stream', () => {
  const pixels = new Uint8Array([0, 1, 1, 0]);
  const encoded = encodeGif([pixels], 2, 2, [[0, 0, 0], [255, 255, 255]], 8);
  assert.equal(new TextDecoder().decode(encoded.slice(0, 6)), 'GIF89a');
  assert.equal(encoded.at(-1), 0x3b);
});

test('density grid keeps the canvas aspect and reads coverage back', () => {
  assert.deepEqual(densityGridSize(1600, 900, 96), { columns: 96, rows: 54 });
  assert.deepEqual(densityGridSize(4, 4, 96), { columns: 4, rows: 4 });
  const grid = sampleGrid();
  assert.equal(densityAt(grid, 0.5 / 8, 0.5 / 6), 1);
  assert.equal(densityAt(grid, 7.5 / 8, 5.5 / 6), 0);
});

test('scan units follow the requested order and hold each step', () => {
  const targets = sampleTargets();
  assert.equal(scanUnits(targets, 'word').length, 3);
  assert.equal(scanUnits(targets, 'line').length, 2);
  const hold = scanHoldSeconds(1);
  assert.equal(scanAt(hold * 0.1, targets, 'word', 1).box, targets.words[0]);
  assert.equal(scanAt(hold * 0.9, targets, 'word', 1).box, targets.words[0]);
  assert.equal(scanAt(hold * 1.5, targets, 'word', 1).box, targets.words[1]);
  assert.equal(scanAt(hold * 3.5, targets, 'word', 1).box, targets.words[0]);
  assert.equal(scanAt(hold * 1.5, targets, 'line', 1).box, targets.lines[1]);
  assert.ok(scanHoldSeconds(0.2) > scanHoldSeconds(2.5));
});

test('the random scan never repeats and covers every unit each round', () => {
  const words = Array.from({ length: 7 }, (unused, index) => ({
    left: index / 7, right: (index + 0.8) / 7, top: 0.1, bottom: 0.2
  }));
  const targets = { words, lines: [] };
  const hold = scanHoldSeconds(1);
  const pick = step => scanAt((step + 0.5) * hold, targets, 'randomWord', 1).box;
  let previous = null;
  for (let round = 0; round < 12; round += 1) {
    const seen = new Set();
    for (let slot = 0; slot < words.length; slot += 1) {
      const box = pick(round * words.length + slot);
      assert.notEqual(box, previous);
      seen.add(box);
      previous = box;
    }
    assert.equal(seen.size, words.length);
  }
});

test('the scan capsule spans its word and blooms inside each hold', () => {
  const targets = sampleTargets();
  const state = { scan: 'word', autoSpeed: 1, brushSize: 0.1, aspect: 2 };
  const hold = scanHoldSeconds(1);
  const box = targets.words[0];
  const radius = (box.bottom - box.top) * 0.5 * (0.82 + 0.1 * 1.4);
  const brush = scanBrush(hold * 0.4, targets, state);
  assert.ok(Math.abs(brush.radius - radius) < 1e-12);
  assert.ok(Math.abs(brush.from.y - (box.top + box.bottom) / 2) < 1e-12);
  // The round caps already reach the ends, so x is inset by the radius.
  assert.ok(Math.abs(brush.from.x - (box.left + radius / state.aspect)) < 1e-12);
  assert.ok(Math.abs(brush.to.x - (box.right - radius / state.aspect)) < 1e-12);
  assert.equal(brush.active, 1);
  assert.ok(scanBrush(hold * 0.02, targets, state).active < 1);
  assert.ok(scanBrush(hold * 0.98, targets, state).active < 1);
});

test('an empty layout parks the scan and injects nothing', () => {
  const state = { scan: 'word', autoSpeed: 1, brushSize: 0.1, aspect: 2 };
  const brush = scanBrush(4, emptyScanTargets(), state);
  assert.equal(brush.active, 0);
  assert.deepEqual(brush.from, { x: 0.5, y: 0.5 });
});
