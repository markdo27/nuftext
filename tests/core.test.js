import test from 'node:test';
import assert from 'node:assert/strict';
import { autoBrushAt, hexToRgb, triangleWave } from '../src/math.js';
import { applyPalette, createState, PALETTES, resetState } from '../src/state.js';
import { encodeGif } from '../src/gif.js';
import { densityAt, densityFromPixels, densityGridSize } from '../src/density.js';
import { autoEdgeAt, buildEdgeTargets, edgeBrush, edgeHoldSeconds } from '../src/auto-edge.js';

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

test('edge targets favour dense clusters away from the block centre', () => {
  const targets = buildEdgeTargets(sampleGrid());
  assert.equal(targets.cells.length, 6);
  const corner = targets.cells.find(cell => cell.x < 0.2 && cell.y < 0.2);
  const middle = targets.cells.find(cell => cell.x > 0.5);
  assert.ok(corner.weight > middle.weight);
  assert.ok(targets.total > 0);
});

test('empty text yields no edge targets and a centred fallback', () => {
  const empty = densityFromPixels(new Uint8Array(4 * 4 * 4), 4, 4);
  const targets = buildEdgeTargets(empty);
  assert.equal(targets.cells.length, 0);
  const hold = edgeHoldSeconds(1);
  assert.deepEqual(autoEdgeAt(hold * 3.5, targets, 1), { x: 0.5, y: 0.5, coverage: 0, step: 3, hold });
});

test('the edge scan is a pure function of time and holds each step', () => {
  const targets = buildEdgeTargets(sampleGrid());
  const hold = edgeHoldSeconds(1);
  const first = autoEdgeAt(hold * 0.1, targets, 1);
  assert.deepEqual(autoEdgeAt(hold * 0.9, targets, 1), first);
  assert.equal(autoEdgeAt(hold * 1.5, targets, 1).step, first.step + 1);
  assert.ok(edgeHoldSeconds(0.2) > edgeHoldSeconds(2.5));
});

test('edge brush widens on heavier clusters', () => {
  const targets = buildEdgeTargets(sampleGrid());
  const state = { autoSpeed: 1, brushSize: 0.1 };
  const times = Array.from({ length: 40 }, (unused, index) => index * edgeHoldSeconds(1));
  const radii = times.map(time => edgeBrush(time, targets, state).radius);
  assert.ok(Math.min(...radii) >= 0.1 * 0.75);
  assert.ok(Math.max(...radii) <= 0.1 * (0.75 + 0.9));
  radii.forEach((radius, index) => {
    const expected = 0.1 * (0.75 + autoEdgeAt(times[index], targets, 1).coverage * 0.9);
    assert.ok(Math.abs(radius - expected) < 1e-12);
  });
});
