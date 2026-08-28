import test from 'node:test';
import assert from 'node:assert/strict';
import { autoBrushAt, hexToRgb, triangleWave } from '../src/math.js';
import { applyPalette, createState, PALETTES, resetState } from '../src/state.js';
import { encodeGif } from '../src/gif.js';
import { densityAt, densityFromPixels, densityGridSize } from '../src/density.js';
import {
  buildScanTimeline, capsuleBrush, emptyScanTargets, roundOrder,
  scanAt, scanBrushes, scanHoldSeconds, scanUnits
} from '../src/word-scan.js';

// Two lines, "on y" over "trouve", as normalized boxes. The words are
// deliberately different widths so reading rhythm has something to bite on.
function sampleTargets() {
  const row = (left, right, top) => ({ left, right, top, bottom: top + 0.14 });
  return {
    characters: [row(0.20, 0.26, 0.10), row(0.28, 0.34, 0.10), row(0.48, 0.56, 0.10)],
    words: [row(0.20, 0.44, 0.10), row(0.48, 0.56, 0.10), row(0.18, 0.72, 0.30)],
    lines: [row(0.20, 0.56, 0.10), row(0.18, 0.72, 0.30)]
  };
}

const scanState = overrides => ({
  scanUnit: 'word',
  scanOrder: 'sequence',
  scanVoices: 1,
  scanRhythm: 0,
  autoSpeed: 1,
  brushSize: 0.1,
  aspect: 2,
  ...overrides
});

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

test('scan units cover characters, words and lines', () => {
  const targets = sampleTargets();
  assert.equal(scanUnits(targets, 'character').length, 3);
  assert.equal(scanUnits(targets, 'word').length, 3);
  assert.equal(scanUnits(targets, 'line').length, 2);
  assert.equal(scanUnits(targets, 'nonsense').length, 3);
});

test('the scan holds each unit in order and wraps round', () => {
  const targets = sampleTargets();
  const timeline = buildScanTimeline(targets, scanState());
  const hold = scanHoldSeconds(1);
  assert.ok(Math.abs(timeline.total - hold * 3) < 1e-12);
  assert.equal(scanAt(timeline, hold * 0.1).index, 0);
  assert.equal(scanAt(timeline, hold * 0.9).index, 0);
  assert.equal(scanAt(timeline, hold * 1.5).index, 1);
  assert.equal(scanAt(timeline, hold * 3.5).index, 0);
  assert.ok(scanHoldSeconds(0.2) > scanHoldSeconds(2.5));
});

test('reading rhythm dwells on long units and keeps the average hold', () => {
  const targets = sampleTargets();
  const even = buildScanTimeline(targets, scanState());
  const rhythmic = buildScanTimeline(targets, scanState({ scanRhythm: 1 }));
  // Same total, so the scan does not drift slower or faster overall.
  assert.ok(Math.abs(rhythmic.total - even.total) < 1e-12);
  const widths = targets.words.map(word => word.right - word.left);
  const longest = widths.indexOf(Math.max(...widths));
  const shortest = widths.indexOf(Math.min(...widths));
  assert.ok(rhythmic.durations[longest] > even.durations[longest]);
  assert.ok(rhythmic.durations[shortest] < even.durations[shortest]);
  assert.ok(rhythmic.durations.every(duration => duration > 0));
});

test('the shuffled order never repeats and covers every unit each round', () => {
  const count = 7;
  for (let round = 0; round < 12; round += 1) {
    const order = roundOrder(count, round, true);
    assert.equal(new Set(order).size, count);
    if (round > 0) assert.notEqual(order[0], roundOrder(count, round - 1, true)[count - 1]);
  }
  // Below three units strict alternation is the only non-repeating sequence.
  assert.deepEqual(roundOrder(2, 5, true), [0, 1]);
});

test('voices ride the same timeline an even share of a round apart', () => {
  const targets = sampleTargets();
  const state = scanState({ scanVoices: 3 });
  const brushes = scanBrushes(0.01, targets, state);
  assert.equal(brushes.length, 3);
  const timeline = buildScanTimeline(targets, state);
  const spread = timeline.total / 3;
  brushes.forEach((brush, voice) => {
    const sample = scanAt(timeline, 0.01 + voice * spread);
    assert.deepEqual(brush.from, capsuleBrush(sample.box, state, brush.active).from);
  });
  // Evenly spaced voices land on different units.
  assert.equal(new Set(brushes.map(brush => brush.from.x)).size, 3);
  assert.equal(scanBrushes(0.01, targets, scanState({ scanVoices: 9 })).length, 4);
  assert.equal(scanBrushes(0.01, targets, scanState({ scanVoices: 0 })).length, 1);
});

test('the capsule spans its unit and blooms inside each hold', () => {
  const targets = sampleTargets();
  const state = scanState();
  const box = targets.words[0];
  const radius = (box.bottom - box.top) * 0.5 * (0.82 + 0.1 * 1.4);
  const hold = scanHoldSeconds(1);
  const [brush] = scanBrushes(hold * 0.4, targets, state);
  assert.ok(Math.abs(brush.radius - radius) < 1e-12);
  assert.ok(Math.abs(brush.from.y - (box.top + box.bottom) / 2) < 1e-12);
  // The round caps already reach the ends, so x is inset by the radius.
  assert.ok(Math.abs(brush.from.x - (box.left + radius / state.aspect)) < 1e-12);
  assert.ok(Math.abs(brush.to.x - (box.right - radius / state.aspect)) < 1e-12);
  assert.equal(brush.active, 1);
  assert.ok(scanBrushes(hold * 0.02, targets, state)[0].active < 1);
  assert.ok(scanBrushes(hold * 0.98, targets, state)[0].active < 1);
});

test('a unit narrower than the capsule collapses to its midpoint', () => {
  const narrow = { characters: [], words: [{ left: 0.4, right: 0.41, top: 0.1, bottom: 0.4 }], lines: [] };
  const [brush] = scanBrushes(0.01, narrow, scanState());
  assert.equal(brush.from.x, 0.405);
  assert.equal(brush.to.x, 0.405);
});

test('pick mode and an empty layout inject nothing', () => {
  assert.deepEqual(scanBrushes(4, sampleTargets(), scanState({ scanOrder: 'pick' })), []);
  assert.deepEqual(scanBrushes(4, emptyScanTargets(), scanState()), []);
});
