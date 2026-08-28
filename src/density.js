import { clamp } from './math.js';

const DEFAULT_COLUMNS = 96;

export function densityGridSize(width, height, columns = DEFAULT_COLUMNS) {
  const gridColumns = Math.max(2, Math.min(columns, Math.round(width)));
  const gridRows = Math.max(2, Math.round(gridColumns * height / width));
  return { columns: gridColumns, rows: gridRows };
}

// The mask is drawn white on transparent, so alpha alone carries the ink coverage.
export function densityFromPixels(pixels, columns, rows) {
  const values = new Float32Array(columns * rows);
  for (let index = 0; index < values.length; index += 1) {
    values[index] = pixels[index * 4 + 3] / 255;
  }
  return { values, columns, rows };
}

export function emptyDensity() {
  return { values: new Float32Array(4), columns: 2, rows: 2 };
}

// x and y are normalized with y running downwards, matching pointer coordinates.
export function densityAt(grid, x, y) {
  const column = clamp(x * grid.columns - 0.5, 0, grid.columns - 1);
  const row = clamp(y * grid.rows - 0.5, 0, grid.rows - 1);
  const left = Math.floor(column);
  const top = Math.floor(row);
  const right = Math.min(left + 1, grid.columns - 1);
  const bottom = Math.min(top + 1, grid.rows - 1);
  const fadeX = column - left;
  const fadeY = row - top;
  const topRow = grid.values[top * grid.columns + left] * (1 - fadeX)
    + grid.values[top * grid.columns + right] * fadeX;
  const bottomRow = grid.values[bottom * grid.columns + left] * (1 - fadeX)
    + grid.values[bottom * grid.columns + right] * fadeX;
  return topRow * (1 - fadeY) + bottomRow * fadeY;
}
