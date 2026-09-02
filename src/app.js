import { ExportController } from './exporters.js';
import { HeatInteraction } from './interaction.js';
import { paletteCss } from './math.js';
import { ThermalRenderer } from './renderer.js';
import { applyPalette, createState, FONT_OPTIONS, PALETTES, resetState } from './state.js';
import { loadCustomFont, rasterizeText } from './text-mask.js';

const state = createState();
const canvas = document.querySelector('#art');
const cursorRing = document.querySelector('#cursorRing');
const fatal = document.querySelector('#fatal');
let renderer;

try {
  renderer = new ThermalRenderer(canvas);
} catch (error) {
  fatal.hidden = false;
  console.error(error);
}

function startApplication() {
  const interaction = new HeatInteraction(canvas, cursorRing);
  let renderRequested = true;
  let previousTime = performance.now();

  const requestRender = () => { renderRequested = true; };
  const refreshMask = (preserveDynamics = false) => {
    if (!renderer.width || !renderer.height) return;
    const result = rasterizeText(renderer.width, renderer.height, state);
    renderer.uploadMask(result.canvas, { preserveDynamics });
    renderer.uploadDensity(result.density.canvas);
    interaction.setBounds(result.bounds);
    interaction.setLayout(result.targets);
    requestRender();
  };
  const resizeArtwork = (width, height, options = {}) => {
    renderer.resize(width, height);
    refreshMask(options.preserveDynamics);
    updateSizeHud();
  };
  const setPreviewSize = () => {
    const height = 1200;
    resizeArtwork(Math.round(height * state.aspect), height);
    renderer.clearHeat();
    interaction.resetClock();
  };

  buildFontMenu();
  const sliderBindings = buildSliders(requestRender, refreshMask, interaction);
  bindTextControls(refreshMask);
  bindInteractionControls(renderer, interaction, requestRender);
  bindPaletteControls(requestRender);
  bindTextureControls(requestRender);
  bindCanvasControls(setPreviewSize);

  const exporter = new ExportController({
    renderer,
    state,
    interaction,
    resizeArtwork,
    setStatus: updateExportStatus,
    setBusy: setExportBusy
  });
  bindExports(exporter);

  bindAdvancedToggle();

  document.querySelector('#resetAll').addEventListener('click', () => {
    resetState(state);
    syncControls(sliderBindings);
    renderer.clearHeat();
    interaction.resetClock();
    setPreviewSize();
    updateExportStatus('');
  });

  const boot = () => {
    syncControls(sliderBindings);
    setPreviewSize();
    requestAnimationFrame(loop);
  };
  loadBuiltInFonts().then(boot).catch(boot);

  function loop(now) {
    const deltaTime = Math.min(0.05, (now - previousTime) / 1000);
    previousTime = now;
    if (!state.paused) {
      const brushes = interaction.next(now, state);
      renderer.stepHeat(deltaTime, brushes, state);
      renderer.stepGoo(deltaTime, state);
      renderer.render(state);
      renderRequested = false;
    } else if (renderRequested) {
      renderer.render(state);
      renderRequested = false;
    }
    interaction.updateCursorSize(state);
    requestAnimationFrame(loop);
  }
}

/**
 * Controls kept out of the way until Advanced is switched on.
 *
 * The split is by whether a control changes what you are making or how it
 * is made. Size, brush, palette and goo amount are the first things anyone
 * reaches for; goo viscosity, density bias and misregistration only mean
 * something once you already know what the first set does. Hiding the
 * second group takes the panel from 27 sliders to 10, which is the
 * difference between a tool you can open and one you have to study.
 *
 * Nothing is disabled — every value stays live and exports exactly as set,
 * so a preset built with Advanced on still renders correctly with it off.
 */
const ADVANCED_KEYS = new Set([
  // Text — fine typesetting, not needed to get a first result
  'tracking', 'leading',
  // Interaction — scan tuning and the goo envelope
  'scanVoices', 'scanRhythm', 'brushEdgeBlur', 'heatSustain', 'trail',
  'gooRise', 'gooDwell', 'wobble',
  // Effect — the physics behind the look rather than the look itself
  'gooSpread', 'gooViscosity', 'gooThreshold', 'densityBias', 'coreColorization',
  // Texture — grain and plate detail
  'grainSize', 'misregistration'
]);

const SLIDER_GROUPS = {
  textSliders: [
    ['fontScale', 'Size', 0.5, 1.3, 0.01, 'percent', true],
    ['tracking', 'Tracking', -0.08, 0.1, 0.001, 'decimal', true],
    ['leading', 'Leading', 0.65, 1.3, 0.01, 'decimal', true]
  ],
  scanSliders: [
    ['scanVoices', 'Scan voices', 1, 4, 1, 'count'],
    ['scanRhythm', 'Reading rhythm', 0, 1, 0.01, 'percent']
  ],
  interactionSliders: [
    ['brushSize', 'Brush size', 0.005, 0.25, 0.0025, 'percent'],
    ['brushEdgeBlur', 'Brush edge blur', 0, 1, 0.01, 'percent'],
    ['heatStrength', 'Heat strength', 0.2, 1.5, 0.01, 'decimal'],
    ['heatSustain', 'Heat sustain', 0, 3, 0.05, 'decimal'],
    ['trail', 'Trail length', 0, 0.95, 0.01, 'percent'],
    ['gooRise', 'Goo rise', 0.05, 4, 0.05, 'decimal'],
    ['gooDwell', 'Goo dwell', 0.2, 8, 0.1, 'decimal'],
    ['autoSpeed', 'Auto speed', 0.2, 2.5, 0.01, 'decimal'],
    ['wobble', 'Vertical wobble', 0, 1, 0.01, 'percent']
  ],
  effectSliders: [
    ['contourWidth', 'Contour width', 0, 1, 0.01, 'percent'],
    ['glowRadius', 'Glow radius', 0, 1, 0.01, 'percent'],
    ['gooAmount', 'Goo amount', 0, 1, 0.01, 'percent'],
    ['gooSpread', 'Goo spread', 0, 1, 0.01, 'percent'],
    ['gooViscosity', 'Goo viscosity', 0, 1, 0.01, 'percent'],
    ['gooThreshold', 'Goo threshold', 0.3, 0.62, 0.005, 'decimal'],
    ['gooDissolve', 'Goo dissolve', 0, 1, 0.01, 'percent'],
    ['densityBias', 'Density bias', 0, 1, 0.01, 'percent'],
    ['coreColorization', 'Core colorization', 0, 1, 0.01, 'percent'],
    ['effectIntensity', 'Effect intensity', 0.4, 1.8, 0.01, 'decimal']
  ],
  textureSliders: [
    ['grain', 'Print grain', 0, 0.6, 0.01, 'percent'],
    ['grainSize', 'Grain size', 1, 8, 0.1, 'decimal'],
    ['misregistration', 'Colour offset', 0, 0.006, 0.0001, 'fine']
  ]
};

/**
 * Advanced is a view state, not a setting: it only decides what the panel
 * shows. It is remembered per browser so someone who has opened it once
 * does not have to keep re-opening it, and the count tells a first-time
 * user the extra controls exist at all rather than leaving them hidden
 * behind an unlabelled switch.
 */
function bindAdvancedToggle() {
  const button = document.querySelector('#advancedToggle');
  const count = document.querySelectorAll('[data-advanced]').length;
  const label = button.querySelector('.toggle-count');
  if (label) label.textContent = String(count);

  /* The body flag deliberately uses a different attribute from the control
     markers. Reusing `data-advanced` for both made `<body>` itself match
     `[data-advanced]`, so the count query picked up the container it was
     counting inside of. */
  const apply = on => {
    document.body.dataset.showAdvanced = on ? 'on' : 'off';
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', String(on));
  };

  let stored = null;
  try { stored = localStorage.getItem('thermal-type-advanced'); } catch { /* private mode */ }
  apply(stored === 'on');

  button.addEventListener('click', () => {
    const next = document.body.dataset.showAdvanced !== 'on';
    apply(next);
    try { localStorage.setItem('thermal-type-advanced', next ? 'on' : 'off'); } catch { /* not persisted */ }
  });
}

function buildSliders(requestRender, refreshMask, interaction) {
  const bindings = new Map();
  Object.entries(SLIDER_GROUPS).forEach(([containerId, definitions]) => {
    const container = document.querySelector(`#${containerId}`);
    definitions.forEach(definition => {
      const [key, label, minimum, maximum, step, format, redrawMask] = definition;
      const wrapper = document.createElement('label');
      wrapper.className = 'slider';
      if (ADVANCED_KEYS.has(key)) wrapper.dataset.advanced = '';
      wrapper.innerHTML = `<span class="slider-head"><span>${label}</span><output class="slider-output"></output></span>`;
      const input = document.createElement('input');
      input.type = 'range';
      Object.assign(input, { min: minimum, max: maximum, step, value: state[key] });
      wrapper.append(input);
      const output = wrapper.querySelector('output');
      const updateOutput = () => { output.value = formatSlider(state[key], format); };
      input.addEventListener('input', () => {
        state[key] = Number(input.value);
        updateOutput();
        interaction.updateCursorSize(state);
        redrawMask ? refreshMask() : requestRender();
      });
      updateOutput();
      container.append(wrapper);
      bindings.set(key, { input, updateOutput });
    });
  });
  return bindings;
}

function formatSlider(value, format) {
  if (format === 'percent') {
    const percentage = value * 100;
    return `${percentage < 10 && percentage % 1 ? percentage.toFixed(1) : Math.round(percentage)}%`;
  }
  if (format === 'count') return String(Math.round(value));
  if (format === 'fine') return value.toFixed(4);
  return value.toFixed(2);
}

function buildFontMenu() {
  const menu = document.querySelector('#font');
  Object.keys(FONT_OPTIONS).forEach(name => menu.add(new Option(name, name)));
}

function bindTextControls(refreshMask) {
  const simpleControls = ['text', 'font', 'align', 'textColor'];
  simpleControls.forEach(id => document.querySelector(`#${id}`).addEventListener('input', async event => {
    state[id] = event.target.value;
    if (id === 'font') {
      state.customFont = '';
      await loadBuiltInFont(state.font);
    }
    refreshMask();
  }));
  document.querySelector('#uppercase').addEventListener('change', event => {
    state.uppercase = event.target.value === 'true';
    refreshMask();
  });
  document.querySelector('#fontFile').addEventListener('change', async event => {
    const status = document.querySelector('#fontStatus');
    try {
      status.textContent = 'Loading font…';
      state.customFont = await loadCustomFont(event.target.files[0]);
      status.textContent = event.target.files[0].name;
      refreshMask();
    } catch (error) {
      state.customFont = '';
      status.textContent = `Could not load font: ${error.message}`;
      refreshMask();
    }
  });
}

function bindInteractionControls(renderer, interaction, requestRender) {
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    interaction.resetClock();
    syncModeButtons();
    requestRender();
  }));
  document.querySelector('#pauseToggle').addEventListener('click', event => {
    state.paused = !state.paused;
    event.currentTarget.textContent = state.paused ? 'Play' : 'Pause';
    event.currentTarget.classList.toggle('active', state.paused);
    updateModeHud();
    requestRender();
  });
  document.querySelector('#scanUnit').addEventListener('change', event => {
    state.scanUnit = event.target.value;
    interaction.clearPicks();
    interaction.resetClock();
    requestRender();
  });
  document.querySelector('#scanOrder').addEventListener('change', event => {
    state.scanOrder = event.target.value;
    interaction.resetClock();
    requestRender();
  });
  document.querySelector('#clearHeat').addEventListener('click', () => {
    renderer.clearHeat();
    interaction.clearPicks();
    interaction.resetClock();
    requestRender();
  });
}

function bindPaletteControls(requestRender) {
  const colors = document.querySelector('#paletteColors');
  ['Far', 'Outer', 'Inner', 'Hot'].forEach((name, index) => {
    const label = document.createElement('label');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'color';
    input.dataset.paletteIndex = index;
    input.addEventListener('input', () => {
      state.palette[index] = input.value;
      state.paletteName = 'custom';
      syncPalette();
      requestRender();
    });
    label.append(input);
    colors.append(label);
  });
  document.querySelectorAll('[data-palette]').forEach(button => button.addEventListener('click', () => {
    applyPalette(state, button.dataset.palette);
    syncPalette();
    requestRender();
  }));
}

function bindTextureControls(requestRender) {
  ['backgroundColor', 'paperTint'].forEach(id => document.querySelector(`#${id}`).addEventListener('input', event => {
    state[id] = event.target.value;
    requestRender();
  }));
}

function bindCanvasControls(setPreviewSize) {
  document.querySelector('#aspect').addEventListener('change', event => {
    state.aspect = Number(event.target.value);
    setPreviewSize();
  });
  document.querySelector('#exportHeight').addEventListener('change', event => {
    state.exportHeight = Number(event.target.value);
  });
  document.querySelector('#duration').addEventListener('change', event => {
    state.duration = Number(event.target.value);
  });
}

function bindExports(exporter) {
  document.querySelector('#exportPng').addEventListener('click', () => exporter.exportPng());
  document.querySelector('#exportWebm').addEventListener('click', () => exporter.exportWebm());
  document.querySelector('#exportGif').addEventListener('click', () => exporter.exportGif());
}

function syncControls(sliderBindings) {
  sliderBindings.forEach((binding, key) => {
    binding.input.value = state[key];
    binding.updateOutput();
  });
  ['text', 'font', 'align', 'textColor', 'backgroundColor', 'paperTint', 'scanUnit', 'scanOrder', 'aspect', 'exportHeight', 'duration']
    .forEach(id => { document.querySelector(`#${id}`).value = state[id]; });
  document.querySelector('#uppercase').value = String(state.uppercase);
  document.querySelector('#fontStatus').textContent = 'Built-in font';
  document.querySelector('#pauseToggle').textContent = state.paused ? 'Play' : 'Pause';
  document.querySelector('#pauseToggle').classList.toggle('active', state.paused);
  syncModeButtons();
  syncPalette();
}

function syncModeButtons() {
  document.querySelectorAll('[data-mode]').forEach(button =>
    button.classList.toggle('active', button.dataset.mode === state.mode));
  updateModeHud();
}

function syncPalette() {
  document.querySelector('#paletteBar').style.background = paletteCss(state.palette);
  document.querySelectorAll('[data-palette-index]').forEach(input => {
    input.value = state.palette[Number(input.dataset.paletteIndex)];
  });
  document.querySelectorAll('[data-palette]').forEach(button =>
    button.classList.toggle('active', button.dataset.palette === state.paletteName));
}

const MODE_LABELS = { manual: 'MANUAL BRUSH', auto: 'AUTO SCAN', words: 'WORD SCAN' };

function updateModeHud() {
  const label = state.paused ? 'PAUSED' : MODE_LABELS[state.mode] || MODE_LABELS.manual;
  document.querySelector('#modeHud').textContent = label;
}

function updateSizeHud() {
  if (!renderer) return;
  document.querySelector('#sizeHud').textContent = `${renderer.width} × ${renderer.height}`;
}

function updateExportStatus(message, active = false) {
  const element = document.querySelector('#exportStatus');
  element.textContent = message;
  element.classList.toggle('active', active);
}

function setExportBusy(busy) {
  document.querySelectorAll('.export-grid button').forEach(button => { button.disabled = busy; });
}

const FONT_LOAD_DESCRIPTORS = {
  'Archivo Black': '400 100px "Archivo Black"',
  Anton: '400 100px "Anton"',
  'League Spartan': '900 100px "League Spartan"',
  'Inter Black': '900 100px "Inter"',
  'Space Grotesk': '700 100px "Space Grotesk"',
  'Bebas Neue': '400 100px "Bebas Neue"'
};

function loadBuiltInFont(name) {
  return document.fonts?.load(FONT_LOAD_DESCRIPTORS[name]) || Promise.resolve();
}

function loadBuiltInFonts() {
  if (!document.fonts) return Promise.resolve();
  return Promise.all(Object.keys(FONT_LOAD_DESCRIPTORS).map(loadBuiltInFont));
}

if (renderer) startApplication();
