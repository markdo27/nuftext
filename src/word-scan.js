import { clamp, smoothstep } from './math.js';

const HOLD_SECONDS = 2.2;
const HOLD_SPEED_OFFSET = 0.5;
const RADIUS_BASE = 0.82;
const RADIUS_GAIN = 1.4;
const ATTACK = 0.18;
const RELEASE_START = 0.62;

export const SCAN_ORDERS = {
  word: { unit: 'words', random: false },
  randomWord: { unit: 'words', random: true },
  line: { unit: 'lines', random: false },
  randomLine: { unit: 'lines', random: true }
};

// A deterministic hash keeps the sequence a pure function of time, so the GIF
// exporter replays exactly what the canvas showed.
function hash(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export const emptyScanTargets = () => ({ words: [], lines: [] });

export const scanHoldSeconds = speed => HOLD_SECONDS / (HOLD_SPEED_OFFSET + Math.max(speed, 0));

export function scanUnits(targets, order) {
  return targets[(SCAN_ORDERS[order] || SCAN_ORDERS.word).unit] || [];
}

// A shuffled deck rather than independent draws: every unit is visited once
// per round, and the round boundary is nudged so nothing repeats back to back.
function shuffledOrder(count, round) {
  const order = Array.from({ length: count }, (unused, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const swap = Math.floor(hash(round * 977 + index) * (index + 1));
    const held = order[index];
    order[index] = order[swap];
    order[swap] = held;
  }
  return order;
}

// Swapping the first two entries only ever touches slots 0 and 1, so for three
// or more units the previous round's last entry is safe to read uncorrected.
function roundOrder(count, round) {
  const order = shuffledOrder(count, round);
  if (round === 0) return order;
  const previous = shuffledOrder(count, round - 1);
  if (order[0] !== previous[count - 1]) return order;
  return [order[1], order[0], ...order.slice(2)];
}

function indexForStep(count, step, random) {
  // With fewer than three units strict alternation is the only non-repeating
  // sequence there is, so shuffling cannot add anything.
  if (!random || count < 3) return step % count;
  return roundOrder(count, Math.floor(step / count))[step % count];
}

export function scanAt(time, targets, order, speed) {
  const units = scanUnits(targets, order);
  const hold = scanHoldSeconds(speed);
  const position = Math.max(0, time) / hold;
  const step = Math.floor(position);
  const phase = position - step;
  if (!units.length) return { box: null, step, phase, hold };
  const random = (SCAN_ORDERS[order] || SCAN_ORDERS.word).random;
  return { box: units[indexForStep(units.length, step, random)], step, phase, hold };
}

// Heat a whole word or line as a horizontal capsule matching its own height,
// blooming in and releasing again inside each hold.
export function scanBrush(time, targets, state) {
  const sample = scanAt(time, targets, state.scan, state.autoSpeed);
  const centre = { x: 0.5, y: 0.5 };
  if (!sample.box) {
    return { from: centre, to: centre, radius: state.brushSize, active: 0, step: sample.step };
  }

  const box = sample.box;
  const radius = (box.bottom - box.top) * 0.5 * (RADIUS_BASE + state.brushSize * RADIUS_GAIN);
  const y = (box.top + box.bottom) * 0.5;
  // The capsule's round caps already reach past the ends, so inset by the
  // radius converted from height units into the canvas x axis.
  const inset = radius / Math.max(state.aspect, 0.0001);
  const left = box.left + inset;
  const right = box.right - inset;
  const middle = (box.left + box.right) * 0.5;
  const spans = right > left;
  const active = Math.min(
    smoothstep(0, ATTACK, sample.phase),
    1 - smoothstep(RELEASE_START, 1, sample.phase)
  );

  return {
    from: { x: clamp(spans ? left : middle), y: clamp(y) },
    to: { x: clamp(spans ? right : middle), y: clamp(y) },
    radius,
    active,
    step: sample.step
  };
}
