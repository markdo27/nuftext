export const clamp = (value, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));

export const smoothstep = (edge0, edge1, value) => {
  const position = clamp((value - edge0) / (edge1 - edge0 || 1e-6));
  return position * position * (3 - 2 * position);
};

export const triangleWave = phase => 1 - Math.abs((phase % 2 + 2) % 2 - 1);

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16) / 255);
}

export function paletteCss(colors) {
  const stops = colors.map((color, index) => `${color} ${index * 100 / (colors.length - 1)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

export function autoBrushAt(time, bounds, speed, wobble) {
  const cycle = time * speed * 0.32;
  const x = bounds.left + triangleWave(cycle) * (bounds.right - bounds.left);
  const centerY = (bounds.top + bounds.bottom) * 0.5;
  const rangeY = (bounds.bottom - bounds.top) * 0.42 * wobble;
  const y = centerY + Math.sin(time * speed * 1.37) * rangeY;
  return { x: clamp(x), y: clamp(y) };
}

export const formatPercent = value => `${Math.round(value * 100)}%`;
