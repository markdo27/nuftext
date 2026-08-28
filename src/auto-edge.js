import { clamp } from './math.js';

const MIN_COVERAGE = 0.06;
const EDGE_FLOOR = 0.2;
const COVERAGE_EXPONENT = 1.6;
const EDGE_EXPONENT = 2.4;
const REPEAT_SPACING = 0.18;
const REROLL_ATTEMPTS = 4;
const REROLL_STRIDE = 0.618;
const HOLD_SECONDS = 2.2;
const HOLD_SPEED_OFFSET = 0.5;
const RADIUS_BASE = 0.75;
const RADIUS_GAIN = 0.9;

// A deterministic hash keeps the sequence a pure function of time, so the GIF
// exporter replays exactly what the canvas showed.
function hash(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export const edgeHoldSeconds = speed => HOLD_SECONDS / (HOLD_SPEED_OFFSET + Math.max(speed, 0));

export const emptyEdgeTargets = () => ({ cells: [], total: 0 });

// Weighted so the scan favours dense clusters sitting near the outside of the
// text block: heavy ink reads as "darker" and the corners score highest.
export function buildEdgeTargets(grid) {
  const inked = [];
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const coverage = grid.values[row * grid.columns + column];
      if (coverage < MIN_COVERAGE) continue;
      inked.push({ x: (column + 0.5) / grid.columns, y: (row + 0.5) / grid.rows, coverage });
    }
  }
  if (!inked.length) return emptyEdgeTargets();

  const box = inked.reduce((bounds, cell) => ({
    left: Math.min(bounds.left, cell.x),
    right: Math.max(bounds.right, cell.x),
    top: Math.min(bounds.top, cell.y),
    bottom: Math.max(bounds.bottom, cell.y)
  }), { left: 1, right: 0, top: 1, bottom: 0 });

  const centreX = (box.left + box.right) * 0.5;
  const centreY = (box.top + box.bottom) * 0.5;
  const halfWidth = Math.max((box.right - box.left) * 0.5, 0.0001);
  const halfHeight = Math.max((box.bottom - box.top) * 0.5, 0.0001);

  let total = 0;
  const cells = inked.map(cell => {
    const offsetX = (cell.x - centreX) / halfWidth;
    const offsetY = (cell.y - centreY) / halfHeight;
    const edgeness = clamp(Math.hypot(offsetX, offsetY));
    const weight = Math.pow(cell.coverage, COVERAGE_EXPONENT)
      * Math.pow(EDGE_FLOOR + edgeness, EDGE_EXPONENT);
    total += weight;
    return { ...cell, weight };
  });
  return { cells, total };
}

function pickCell(targets, seed) {
  let remaining = hash(seed) * targets.total;
  for (const cell of targets.cells) {
    remaining -= cell.weight;
    if (remaining <= 0) return cell;
  }
  return targets.cells[targets.cells.length - 1];
}

// Re-roll when a step lands next to the previous one, so the scan keeps hopping
// around the block instead of pulsing twice in the same corner.
function cellForStep(targets, step) {
  const previous = step > 0 ? pickCell(targets, step - 1) : null;
  let cell = pickCell(targets, step);
  for (let attempt = 1; previous && attempt <= REROLL_ATTEMPTS; attempt += 1) {
    if (Math.hypot(cell.x - previous.x, cell.y - previous.y) >= REPEAT_SPACING) break;
    cell = pickCell(targets, step + attempt * REROLL_STRIDE);
  }
  return cell;
}

export function autoEdgeAt(time, targets, speed) {
  const hold = edgeHoldSeconds(speed);
  const step = Math.max(0, Math.floor(time / hold));
  if (!targets.cells.length) return { x: 0.5, y: 0.5, coverage: 0, step, hold };
  const cell = cellForStep(targets, step);
  return { x: cell.x, y: cell.y, coverage: cell.coverage, step, hold };
}

// Denser clusters get a wider brush, so a hit reads as a cluster rather than a dot.
export function edgeBrush(time, targets, state) {
  const target = autoEdgeAt(time, targets, state.autoSpeed);
  return {
    x: target.x,
    y: target.y,
    step: target.step,
    radius: state.brushSize * (RADIUS_BASE + target.coverage * RADIUS_GAIN)
  };
}
