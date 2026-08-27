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
  text: 'Good\nexperiences\ndon’t happen\nby accident.\nThey are\ndesigned.',
  font: 'Archivo Black',
  customFont: '',
  fontScale: 1.17,
  tracking: -0.08,
  leading: 0.78,
  align: 'center',
  uppercase: true,
  textColor: '#4a4a4a',
  mode: 'auto',
  paused: false,
  brushSize: 0.02,
  brushEdgeBlur: 0.65,
  heatStrength: 1.5,
  trail: 0,
  autoSpeed: 0.2,
  wobble: 0,
  contourWidth: 0.88,
  glowRadius: 0.79,
  meltAmount: 0.16,
  meltFlow: 1,
  coreColorization: 1,
  effectIntensity: 1.41,
  paletteName: 'magenta',
  palette: PALETTES.magenta,
  grain: 0.14,
  grainSize: 2,
  misregistration: 0,
  backgroundColor: '#f4f2ec',
  paperTint: '#f4f2ec',
  aspect: 1.7778,
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
