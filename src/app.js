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
    interaction.setBounds(result.bounds);
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
      const brush = interaction.next(now, state);
      renderer.stepHeat(deltaTime, brush.from, brush.to, brush.active, state);
      renderer.stepMelt(deltaTime, state);
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

const SLIDER_GROUPS = {
  textSliders: [
    ['fontScale', 'Size', 0.5, 1.3, 0.01, 'percent', true],
    ['tracking', 'Tracking', -0.08, 0.1, 0.001, 'decimal', true],
    ['leading', 'Leading', 0.65, 1.3, 0.01, 'decimal', true]
  ],
  interactionSliders: [
    ['brushSize', 'Brush size', 0.05, 0.45, 0.005, 'percent'],
    ['heatStrength', 'Heat strength', 0.2, 1.5, 0.01, 'decimal'],
    ['trail', 'Trail length', 0, 0.95, 0.01, 'percent'],
    ['autoSpeed', 'Auto speed', 0.2, 2.5, 0.01, 'decimal'],
    ['wobble', 'Vertical wobble', 0, 1, 0.01, 'percent']
  ],
  effectSliders: [
    ['contourWidth', 'Contour width', 0, 1, 0.01, 'percent'],
    ['glowRadius', 'Glow radius', 0, 1, 0.01, 'percent'],
    ['meltAmount', 'Text melt', 0, 0.16, 0.001, 'percent'],
    ['meltFlow', 'Melt response', 0, 1, 0.01, 'percent'],
    ['coreColorization', 'Core colorization', 0, 1, 0.01, 'percent'],
    ['effectIntensity', 'Effect intensity', 0.4, 1.8, 0.01, 'decimal']
  ],
  textureSliders: [
    ['grain', 'Print grain', 0, 0.6, 0.01, 'percent'],
    ['grainSize', 'Grain size', 1, 8, 0.1, 'decimal'],
    ['misregistration', 'Colour offset', 0, 0.006, 0.0001, 'fine']
  ]
};

function buildSliders(requestRender, refreshMask, interaction) {
  const bindings = new Map();
  Object.entries(SLIDER_GROUPS).forEach(([containerId, definitions]) => {
    const container = document.querySelector(`#${containerId}`);
    definitions.forEach(definition => {
      const [key, label, minimum, maximum, step, format, redrawMask] = definition;
      const wrapper = document.createElement('label');
      wrapper.className = 'slider';
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
  if (format === 'percent') return `${Math.round(value * 100)}%`;
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
  document.querySelector('#clearHeat').addEventListener('click', () => {
    renderer.clearHeat();
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
  ['text', 'font', 'align', 'textColor', 'backgroundColor', 'paperTint', 'aspect', 'exportHeight', 'duration']
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

function updateModeHud() {
  const label = state.paused ? 'PAUSED' : state.mode === 'auto' ? 'AUTO SCAN' : 'MANUAL BRUSH';
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
