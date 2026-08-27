import test from 'node:test';
import assert from 'node:assert/strict';
import { autoBrushAt, hexToRgb, triangleWave } from '../src/math.js';
import { applyPalette, createState, PALETTES, resetState } from '../src/state.js';
import { encodeGif } from '../src/gif.js';

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
  assert.ok(state.meltAmount > 0);
  assert.ok(state.meltFlow > 0);
  applyPalette(state, 'acid');
  state.palette[0] = '#000000';
  assert.notEqual(PALETTES.acid[0], '#000000');
  resetState(state);
  assert.equal(state.paletteName, 'magenta');
});

test('GIF encoder emits a complete GIF89a stream', () => {
  const pixels = new Uint8Array([0, 1, 1, 0]);
  const encoded = encodeGif([pixels], 2, 2, [[0, 0, 0], [255, 255, 255]], 8);
  assert.equal(new TextDecoder().decode(encoded.slice(0, 6)), 'GIF89a');
  assert.equal(encoded.at(-1), 0x3b);
});
