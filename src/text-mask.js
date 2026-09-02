import { FONT_OPTIONS } from './state.js';
import { clamp } from './math.js';
import { densityFromPixels, densityGridSize } from './density.js';

const maskCanvas = document.createElement('canvas');
const context = maskCanvas.getContext('2d', { alpha: true });
const densityCanvas = document.createElement('canvas');
const densityContext = densityCanvas.getContext('2d', { alpha: true, willReadFrequently: true });

// Downscaling the finished mask is the cheapest possible box filter, and the
// result doubles as the gradient map: bright cells are heavy clusters of ink.
function buildDensity(width, height) {
  const { columns, rows } = densityGridSize(width, height);
  densityCanvas.width = columns;
  densityCanvas.height = rows;
  densityContext.clearRect(0, 0, columns, rows);
  densityContext.imageSmoothingEnabled = true;
  densityContext.imageSmoothingQuality = 'high';
  densityContext.drawImage(maskCanvas, 0, 0, columns, rows);
  const pixels = densityContext.getImageData(0, 0, columns, rows).data;
  return { canvas: densityCanvas, grid: densityFromPixels(pixels, columns, rows) };
}

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

function balanceWords(source) {
  if (source.includes('\n')) return source.split('\n');
  const words = source.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return [source];
  const lineCount = Math.min(5, Math.max(2, Math.round(words.length / 2.35)));
  const lines = [];
  let wordIndex = 0;

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const remainingLines = lineCount - lineIndex;
    const remainingWords = words.slice(wordIndex);
    const targetLength = remainingWords.join(' ').length / remainingLines;
    const line = [];

    while (wordIndex < words.length) {
      const candidate = [...line, words[wordIndex]].join(' ');
      const wordsAfterCandidate = words.length - wordIndex - 1;
      if (line.length && candidate.length > targetLength && wordsAfterCandidate >= remainingLines - 1) {
        const current = line.join(' ');
        if (Math.abs(current.length - targetLength) <= Math.abs(candidate.length - targetLength)) break;
      }
      line.push(words[wordIndex]);
      wordIndex += 1;
      if (words.length - wordIndex === remainingLines - 1) break;
    }
    lines.push(line.join(' '));
  }
  return lines;
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

// Vertical extent of a word, from the font where the browser reports it.
function verticalExtent(word, baseline, size) {
  const metrics = context.measureText(word);
  const ascent = metrics.actualBoundingBoxAscent || size * 0.75;
  const descent = metrics.actualBoundingBoxDescent || size * 0.22;
  return { top: baseline - ascent, bottom: baseline + descent };
}

// Walks the line the same way drawTracked does, so the boxes line up with the
// glyphs actually painted into the mask.
function trackedBoxes(line, x, baseline, tracking, size) {
  const words = [];
  const characters = [];
  let cursor = x;
  let start = null;
  let word = '';

  const flush = right => {
    if (start === null) return;
    words.push({ left: start, right, ...verticalExtent(word, baseline, size) });
    start = null;
    word = '';
  };

  for (const character of line) {
    const advance = context.measureText(character).width;
    if (character === ' ') {
      flush(cursor - tracking);
    } else {
      if (start === null) start = cursor;
      word += character;
      characters.push({
        left: cursor,
        right: cursor + advance,
        ...verticalExtent(character, baseline, size)
      });
    }
    cursor += advance + tracking;
  }
  flush(cursor - tracking);
  return { words, characters };
}

function mergeBoxes(boxes) {
  return boxes.reduce((merged, box) => ({
    left: Math.min(merged.left, box.left),
    right: Math.max(merged.right, box.right),
    top: Math.min(merged.top, box.top),
    bottom: Math.max(merged.bottom, box.bottom)
  }));
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
  const lines = balanceWords(source.replace(/\r/g, ''));
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
  const characterBoxes = [];
  const wordBoxes = [];
  const lineBoxes = [];
  lines.forEach((line, index) => {
    const lineWidth = measureTracked(line, tracking);
    const x = lineOrigin(state.align, width, margin, lineWidth);
    const baseline = top + index * lineHeight + size * 0.79;
    drawTracked(line, x, baseline, tracking);
    const boxes = trackedBoxes(line, x, baseline, tracking, size);
    if (boxes.words.length) {
      characterBoxes.push(...boxes.characters);
      wordBoxes.push(...boxes.words);
      lineBoxes.push(mergeBoxes(boxes.words));
    }
    if (line.length) {
      left = Math.min(left, x);
      right = Math.max(right, x + lineWidth);
    }
  });

  const normalize = box => ({
    left: box.left / width,
    right: box.right / width,
    top: box.top / height,
    bottom: box.bottom / height
  });
  const targets = {
    characters: characterBoxes.map(normalize),
    words: wordBoxes.map(normalize),
    lines: lineBoxes.map(normalize)
  };

  const hasText = right > left;
  const bounds = hasText ? {
    left: clamp(left / width - 0.06),
    right: clamp(right / width + 0.06),
    top: clamp(top / height - 0.05),
    bottom: clamp((top + blockHeight) / height + 0.05)
  } : { left: 0.15, right: 0.85, top: 0.3, bottom: 0.7 };

  return { canvas: maskCanvas, bounds, targets, fontSize: size, density: buildDensity(width, height) };
}

export async function loadCustomFont(file) {
  if (!file) throw new Error('No font file selected.');
  const family = `ThermalTypeUpload_${Date.now()}`;
  const bytes = await file.arrayBuffer();
  const face = new FontFace(family, bytes);
  const loaded = await face.load();
  document.fonts.add(loaded);
  return family;
}
