export const FONT_OPTIONS = {
  'Archivo Black': '"Archivo Black", sans-serif',
  Anton: '"Anton", sans-serif',
  'League Spartan': '"League Spartan", sans-serif',
  'Inter Black': '"Inter", sans-serif',
  'Space Grotesk': '"Space Grotesk", sans-serif',
  'Bebas Neue': '"Bebas Neue", sans-serif'
};

export const PALETTES = {
  acid: ['#22b7e8', '#11a47d', '#ffe929', '#fff8d4'],
  magenta: ['#f229c2', '#ff315c', '#ff5725', '#ffd17b'],
  cyanPink: ['#20c5ef', '#16a4bf', '#ff4aa5', '#fff0f8']
};

export const DEFAULTS = Object.freeze({
  text: 'THERMAL\nTYPE',
  font: 'Archivo Black',
  customFont: '',
  fontScale: 1,
  tracking: -0.025,
  leading: 0.88,
  align: 'center',
  uppercase: true,
  textColor: '#111111',
  mode: 'auto',
  paused: false,
  brushSize: 0.13,
  heatStrength: 1,
  trail: 0.45,
  autoSpeed: 0.72,
  wobble: 0.55,
  contourWidth: 0.46,
  glowRadius: 0.58,
  meltAmount: 0.075,
  meltFlow: 0.80,
  coreColorization: 0.22,
  effectIntensity: 1.15,
  paletteName: 'magenta',
  palette: PALETTES.magenta,
  grain: 0.18,
  grainSize: 1.4,
  misregistration: 0.0018,
  backgroundColor: '#f4f2ec',
  paperTint: '#f4f2ec',
  aspect: 0.8,
  exportHeight: 2400,
  duration: 4
});

export function createState() {
  return structuredClone(DEFAULTS);
}

export function resetState(state) {
  Object.assign(state, createState());
}

export function applyPalette(state, name) {
  state.paletteName = name;
  state.palette = [...PALETTES[name]];
}
