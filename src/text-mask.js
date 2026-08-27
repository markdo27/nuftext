import { FONT_OPTIONS } from './state.js';
import { clamp } from './math.js';

const maskCanvas = document.createElement('canvas');
const context = maskCanvas.getContext('2d', { alpha: true });

function fontStack(state) {
  return state.customFont ? `"${state.customFont}", sans-serif` : FONT_OPTIONS[state.font];
}

function fontWeight(state) {
  if (state.customFont) return 400;
  if (state.font === 'Space Grotesk') return 700;
  return ['Inter Black', 'League Spartan'].includes(state.font) ? 900 : 400;
}

function measureTracked(text, tracking) {
  const characters = [...text];
  const glyphWidth = characters.reduce((sum, character) => sum + context.measureText(character).width, 0);
  return glyphWidth + Math.max(0, characters.length - 1) * tracking;
}

function fitFontSize(lines, width, height, state) {
  const availableWidth = width * 0.82;
  const availableHeight = height * 0.76;
  let size = height * 0.3;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    context.font = `${fontWeight(state)} ${size}px ${fontStack(state)}`;
    const tracking = size * state.tracking;
    const widest = Math.max(1, ...lines.map(line => measureTracked(line, tracking)));
    const blockHeight = lines.length * size * state.leading;
    if (widest <= availableWidth && blockHeight <= availableHeight) break;
    size *= 0.96;
  }
  return Math.max(8, size * state.fontScale);
}

function lineOrigin(align, width, margin, lineWidth) {
  if (align === 'left') return margin;
  if (align === 'right') return width - margin - lineWidth;
  return (width - lineWidth) * 0.5;
}

function drawTracked(text, x, baseline, tracking) {
  let cursor = x;
  for (const character of text) {
    context.fillText(character, cursor, baseline);
    cursor += context.measureText(character).width + tracking;
  }
}

export function rasterizeText(width, height, state) {
  maskCanvas.width = width;
  maskCanvas.height = height;
  context.clearRect(0, 0, width, height);

  const source = state.uppercase ? state.text.toLocaleUpperCase() : state.text;
  const lines = source.replace(/\r/g, '').split('\n');
  const size = fitFontSize(lines, width, height, state);
  const lineHeight = size * state.leading;
  const blockHeight = lines.length * lineHeight;
  const top = (height - blockHeight) * 0.5;
  const margin = width * 0.09;

  context.font = `${fontWeight(state)} ${size}px ${fontStack(state)}`;
  context.fillStyle = '#ffffff';
  context.textBaseline = 'alphabetic';
  const tracking = size * state.tracking;

  let left = width;
  let right = 0;
  lines.forEach((line, index) => {
    const lineWidth = measureTracked(line, tracking);
    const x = lineOrigin(state.align, width, margin, lineWidth);
    const baseline = top + index * lineHeight + size * 0.79;
    drawTracked(line, x, baseline, tracking);
    if (line.length) {
      left = Math.min(left, x);
      right = Math.max(right, x + lineWidth);
    }
  });

  const hasText = right > left;
  const bounds = hasText ? {
    left: clamp(left / width - 0.06),
    right: clamp(right / width + 0.06),
    top: clamp(top / height - 0.05),
    bottom: clamp((top + blockHeight) / height + 0.05)
  } : { left: 0.15, right: 0.85, top: 0.3, bottom: 0.7 };

  return { canvas: maskCanvas, bounds, fontSize: size };
}

export async function loadCustomFont(file) {
  if (!file) throw new Error('No font file selected.');
  const family = `NuftextUpload_${Date.now()}`;
  const bytes = await file.arrayBuffer();
  const face = new FontFace(family, bytes);
  const loaded = await face.load();
  document.fonts.add(loaded);
  return family;
}
