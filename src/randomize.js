import { FONT_OPTIONS } from './state.js';

/**
 * Randomisation of the look only.
 *
 * What is deliberately left alone: the text, its alignment and case, the
 * canvas format, export height and duration, and the interaction mode.
 * Those are decisions the user has already made — a randomiser that
 * rewrites the copy or flips the aspect ratio is not offering variations
 * on your poster, it is replacing it.
 *
 * Ranges below are narrower than the sliders allow. The sliders have to
 * reach the extremes so the tool can be pushed; a randomiser that visits
 * them mostly produces unusable frames, and one that mostly produces
 * unusable frames stops being worth pressing. Each band was taken from the
 * part of the range that still reads as type.
 */
const RANGES = {
  // Typography — enough movement to change the composition, not enough to
  // overflow the frame or collapse the leading into overlapping lines.
  fontScale: [0.78, 1.28],
  tracking: [-0.07, 0.05],
  leading: [0.72, 1.05],

  // Heat brush
  brushSize: [0.05, 0.2],
  brushEdgeBlur: [0.35, 1],
  heatStrength: [0.7, 1.5],
  heatSustain: [0, 1.2],
  trail: [0.55, 0.95],

  // Motion
  autoSpeed: [0.3, 1.2],
  wobble: [0.15, 0.85],

  // Goo. Threshold stays mid-band: near its floor the letters dissolve
  // before they read, near its ceiling nothing melts at all.
  gooAmount: [0.45, 1],
  gooSpread: [0.3, 0.9],
  gooViscosity: [0.4, 1],
  gooThreshold: [0.4, 0.58],
  gooDissolve: [0.15, 0.95],
  gooRise: [0.05, 1.6],
  gooDwell: [0.3, 3],

  // Halo
  contourWidth: [0.25, 0.9],
  glowRadius: [0.4, 1],
  densityBias: [0.3, 1],
  coreColorization: [0, 0.45],
  effectIntensity: [0.75, 1.45],

  // Print
  grain: [0.04, 0.34],
  grainSize: [1, 4],
  misregistration: [0, 0.0022]
};

/* Steps match each slider so a randomised value lands on a position the
   control can actually represent — otherwise the readout shows a number
   the user can never dial back to. */
const STEPS = {
  fontScale: 0.01, tracking: 0.001, leading: 0.01,
  brushSize: 0.0025, brushEdgeBlur: 0.01, heatStrength: 0.01,
  heatSustain: 0.05, trail: 0.01, autoSpeed: 0.01, wobble: 0.01,
  gooAmount: 0.01, gooSpread: 0.01, gooViscosity: 0.01, gooThreshold: 0.005,
  gooDissolve: 0.01, gooRise: 0.05, gooDwell: 0.1,
  contourWidth: 0.01, glowRadius: 0.01, densityBias: 0.01,
  coreColorization: 0.01, effectIntensity: 0.01,
  grain: 0.01, grainSize: 0.1, misregistration: 0.0001
};

/* Paper grounds, not arbitrary colours. The artwork is ink on a sheet, and
   a random hue behind it fights the palette instead of carrying it. */
const GROUNDS = ['#f4f2ec', '#efeae1', '#f6f4f0', '#eae7e0', '#f2eeea', '#e8e8e6'];

const quantize = (value, step) => Math.round(value / step) * step;

function pick(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

function hslToHex(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs(((h * 6) % 2) - 1));
  const match = l - chroma / 2;
  const sector = Math.floor(h * 6) % 6;
  const table = [
    [chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]
  ][sector];
  return '#' + table
    .map(channel => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * A four-stop thermal ramp: far, outer, inner, hot.
 *
 * The built-in palettes all sweep roughly a third of the wheel and finish
 * on a pale tint rather than a saturated colour, which is what makes the
 * hottest part of the halo read as light instead of as more paint. Random
 * hues picked independently lose that — the ramp stops looking like one
 * temperature scale and starts looking like four unrelated swatches — so
 * the sweep and the final tint are built in rather than rolled.
 */
export function randomPalette(random = Math.random) {
  const base = random() * 360;
  const direction = random() < 0.5 ? -1 : 1;
  const sweep = (95 + random() * 60) * direction;
  return [
    hslToHex(base, 0.72 + random() * 0.2, 0.5 + random() * 0.08),
    hslToHex(base + sweep * 0.32, 0.74 + random() * 0.2, 0.46 + random() * 0.1),
    hslToHex(base + sweep * 0.72, 0.85 + random() * 0.15, 0.55 + random() * 0.08),
    hslToHex(base + sweep, 0.6 + random() * 0.3, 0.88 + random() * 0.07)
  ];
}

/**
 * Mutates `state` with a fresh look and returns it.
 *
 * `random` is injectable so the result is reproducible under test; the app
 * passes nothing and gets Math.random.
 */
export function randomizeLook(state, random = Math.random) {
  Object.entries(RANGES).forEach(([key, [minimum, maximum]]) => {
    const raw = minimum + random() * (maximum - minimum);
    const step = STEPS[key];
    state[key] = step ? Number(quantize(raw, step).toFixed(6)) : raw;
  });

  state.palette = randomPalette(random);
  state.paletteName = 'custom';
  state.backgroundColor = pick(GROUNDS, random);
  state.paperTint = state.backgroundColor;

  /* Ink is kept near-neutral and dark. The halo supplies the colour; a
     coloured ink competes with it and the letterforms stop reading. */
  const inkValue = Math.round(40 + random() * 50);
  state.textColor = '#' + inkValue.toString(16).padStart(2, '0').repeat(3);

  /* Only swap the family when the user has not uploaded one. Replacing an
     uploaded font would mean re-uploading the file to get it back, which
     no other control in the tool can do to you. */
  if (!state.customFont) {
    state.font = pick(Object.keys(FONT_OPTIONS), random);
  }

  return state;
}
