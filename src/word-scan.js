import { clamp, smoothstep } from './math.js';

const HOLD_SECONDS = 2.2;
const HOLD_SPEED_OFFSET = 0.5;
const RADIUS_BASE = 0.82;
const RADIUS_GAIN = 1.4;
const ATTACK = 0.18;
const RELEASE_START = 0.62;
const MIN_DURATION = 0.15;
const MAX_VOICES = 4;

const UNIT_KEYS = { character: 'characters', word: 'words', line: 'lines' };

// A deterministic hash keeps the sequence a pure function of time, so the GIF
// exporter replays exactly what the canvas showed.
function hash(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export const emptyScanTargets = () => ({ characters: [], words: [], lines: [] });

export const scanHoldSeconds = speed => HOLD_SECONDS / (HOLD_SPEED_OFFSET + Math.max(speed, 0));

export function scanUnits(targets, unit) {
  return targets[UNIT_KEYS[unit] || UNIT_KEYS.word] || [];
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
// Below three, strict alternation is the only non-repeating sequence there is.
export function roundOrder(count, round, shuffle) {
  if (!shuffle || count < 3) return Array.from({ length: count }, (unused, index) => index);
  const order = shuffledOrder(count, round);
  if (round === 0) return order;
  const previous = shuffledOrder(count, round - 1);
  if (order[0] !== previous[count - 1]) return order;
  return [order[1], order[0], ...order.slice(2)];
}

// Reading rhythm: long units dwell, short ones are skimmed. Scaling around the
// mean keeps the average hold at scanHoldSeconds whatever the rhythm.
function unitDurations(units, hold, rhythm) {
  const widths = units.map(unit => Math.max(unit.right - unit.left, 1e-6));
  const mean = widths.reduce((sum, width) => sum + width, 0) / widths.length;
  return widths.map(width => hold * Math.max(1 + rhythm * (width / mean - 1), MIN_DURATION));
}

export function buildScanTimeline(targets, state) {
  const units = scanUnits(targets, state.scanUnit);
  const hold = scanHoldSeconds(state.autoSpeed);
  const durations = units.length ? unitDurations(units, hold, state.scanRhythm) : [];
  return {
    units,
    durations,
    total: durations.reduce((sum, duration) => sum + duration, 0),
    shuffle: state.scanOrder === 'shuffle'
  };
}

// Every round holds the same set of units, so each round lasts the same total
// however they are ordered. Finding the step is then a walk inside one round.
export function scanAt(timeline, time) {
  const { units, durations, total, shuffle } = timeline;
  if (!units.length || total <= 0) return { box: null, index: -1, step: 0, phase: 0 };
  const elapsed = Math.max(0, time);
  const round = Math.floor(elapsed / total);
  const order = roundOrder(units.length, round, shuffle);
  let offset = elapsed - round * total;

  for (let slot = 0; slot < order.length; slot += 1) {
    const index = order[slot];
    if (offset < durations[index]) {
      return { box: units[index], index, step: round * order.length + slot, phase: offset / durations[index] };
    }
    offset -= durations[index];
  }
  const slot = order.length - 1;
  return { box: units[order[slot]], index: order[slot], step: round * order.length + slot, phase: 1 };
}

// Heat a whole unit as a horizontal capsule matching its own height.
export function capsuleBrush(box, state, active, step = 0) {
  const radius = (box.bottom - box.top) * 0.5 * (RADIUS_BASE + state.brushSize * RADIUS_GAIN);
  const y = (box.top + box.bottom) * 0.5;
  // The round caps already reach the ends, so inset by the radius converted
  // from height units into the canvas x axis.
  const inset = radius / Math.max(state.aspect, 1e-4);
  const left = box.left + inset;
  const right = box.right - inset;
  const middle = (box.left + box.right) * 0.5;
  const spans = right > left;
  return {
    from: { x: clamp(spans ? left : middle), y: clamp(y) },
    to: { x: clamp(spans ? right : middle), y: clamp(y) },
    radius,
    active,
    step
  };
}

const bloom = phase =>
  Math.min(smoothstep(0, ATTACK, phase), 1 - smoothstep(RELEASE_START, 1, phase));

export const scanVoiceCount = state => clamp(Math.round(state.scanVoices), 1, MAX_VOICES);

// Voices are the same timeline offset by an even share of one round, so they
// sit on different units and each blooms and releases inside its own hold.
export function scanBrushes(time, targets, state) {
  if (state.scanOrder === 'pick') return [];
  const timeline = buildScanTimeline(targets, state);
  if (!timeline.units.length) return [];
  const voices = scanVoiceCount(state);
  const spread = timeline.total / voices;
  return Array.from({ length: voices }, (unused, voice) => {
    const sample = scanAt(timeline, time + voice * spread);
    return capsuleBrush(sample.box, state, bloom(sample.phase), sample.step);
  });
}
