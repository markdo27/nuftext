function makeColorBox(samples, indices) {
  const low = [255, 255, 255];
  const high = [0, 0, 0];
  const sum = [0, 0, 0];
  indices.forEach(index => {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = samples[index * 3 + channel];
      low[channel] = Math.min(low[channel], value);
      high[channel] = Math.max(high[channel], value);
      sum[channel] += value;
    }
  });
  const extent = high.map((value, channel) => value - low[channel]);
  const weighted = [extent[0] * 0.299, extent[1] * 0.587, extent[2] * 0.114];
  const axis = weighted.indexOf(Math.max(...weighted));
  const count = Math.max(indices.length, 1);
  return {
    indices,
    axis,
    score: weighted[axis] * Math.cbrt(indices.length),
    mean: sum.map(value => Math.round(value / count))
  };
}

export function buildPalette(samples, maximumColors = 256) {
  const indices = Array.from({ length: samples.length / 3 }, (_, index) => index);
  const boxes = [makeColorBox(samples, indices)];
  while (boxes.length < maximumColors) {
    let candidate = -1;
    let score = 0;
    boxes.forEach((box, index) => {
      if (box.indices.length > 1 && box.score > score) {
        candidate = index;
        score = box.score;
      }
    });
    if (candidate < 0) break;
    const box = boxes[candidate];
    box.indices.sort((left, right) =>
      samples[left * 3 + box.axis] - samples[right * 3 + box.axis]);
    const middle = box.indices.length >> 1;
    boxes.splice(candidate, 1,
      makeColorBox(samples, box.indices.slice(0, middle)),
      makeColorBox(samples, box.indices.slice(middle)));
  }
  return boxes.map(box => box.mean);
}

export function createPaletteMapper(palette) {
  const cache = new Int16Array(32768).fill(-1);
  return (red, green, blue) => {
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    if (cache[key] >= 0) return cache[key];
    let bestIndex = 0;
    let bestDistance = Infinity;
    palette.forEach((colour, index) => {
      const dr = red - colour[0];
      const dg = green - colour[1];
      const db = blue - colour[2];
      const distance = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    cache[key] = bestIndex;
    return bestIndex;
  };
}

function lzwEncode(pixels, minimumCodeSize) {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map();
  const bytes = [];
  let accumulator = 0;
  let bitCount = 0;
  const writeCode = code => {
    accumulator |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(accumulator & 255);
      accumulator >>>= 8;
      bitCount -= 8;
    }
  };

  writeCode(clearCode);
  let prefix = pixels[0] || 0;
  for (let index = 1; index < pixels.length; index += 1) {
    const colour = pixels[index];
    const key = (prefix << 8) | colour;
    const found = dictionary.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    writeCode(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
      nextCode += 1;
    } else {
      writeCode(clearCode);
      dictionary = new Map();
      nextCode = endCode + 1;
      codeSize = minimumCodeSize + 1;
    }
    prefix = colour;
  }
  writeCode(prefix);
  writeCode(endCode);
  if (bitCount > 0) bytes.push(accumulator & 255);
  return bytes;
}

export function encodeGif(frames, width, height, palette, delayCentiseconds) {
  const output = [];
  const writeString = value => [...value].forEach(character => output.push(character.charCodeAt(0)));
  const writeShort = value => output.push(value & 255, (value >> 8) & 255);
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(palette.length, 2))));
  const entries = 1 << bits;

  writeString('GIF89a');
  writeShort(width);
  writeShort(height);
  output.push(0x80 | 0x70 | (bits - 1), 0, 0);
  for (let index = 0; index < entries; index += 1) {
    const colour = palette[index] || [0, 0, 0];
    output.push(...colour);
  }
  output.push(0x21, 0xff, 11);
  writeString('NETSCAPE2.0');
  output.push(3, 1, 0, 0, 0);

  frames.forEach(frame => {
    output.push(0x21, 0xf9, 4, 0x04, delayCentiseconds & 255, delayCentiseconds >> 8, 0, 0);
    output.push(0x2c);
    writeShort(0); writeShort(0); writeShort(width); writeShort(height);
    output.push(0, bits);
    const data = lzwEncode(frame, bits);
    for (let index = 0; index < data.length; index += 255) {
      const chunk = data.slice(index, index + 255);
      output.push(chunk.length, ...chunk);
    }
    output.push(0);
  });
  output.push(0x3b);
  return new Uint8Array(output);
}

export function sampleFrame(imageData, stride, target) {
  for (let index = 0; index < imageData.length; index += stride * 4) {
    target.push(imageData[index], imageData[index + 1], imageData[index + 2]);
  }
}

export function indexFrame(imageData, mapper) {
  const indexed = new Uint8Array(imageData.length / 4);
  for (let pixel = 0, channel = 0; pixel < indexed.length; pixel += 1, channel += 4) {
    indexed[pixel] = mapper(imageData[channel], imageData[channel + 1], imageData[channel + 2]);
  }
  return indexed;
}
