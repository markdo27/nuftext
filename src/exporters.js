import { autoBrushAt } from './math.js';
import { scanBrush, scanUnits } from './word-scan.js';
import { buildPalette, createPaletteMapper, encodeGif, indexFrame, sampleFrame } from './gif.js';

const nextTick = (() => {
  const channel = new MessageChannel();
  const queue = [];
  channel.port1.onmessage = () => queue.shift()?.();
  return () => new Promise(resolve => {
    queue.push(resolve);
    channel.port2.postMessage(0);
  });
})();

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function download(blob, extension) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `nuftext-${timestamp()}.${extension}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 8000);
}

function canvasBlob(canvas, type) {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error('The browser could not encode this canvas.')),
    type
  ));
}

export class ExportController {
  constructor(options) {
    Object.assign(this, options);
    this.busy = false;
  }

  async withOutputSize(width, height, operation) {
    const previous = { width: this.renderer.width, height: this.renderer.height };
    this.resizeArtwork(width, height, { preserveDynamics: true });
    try {
      return await operation();
    } finally {
      this.resizeArtwork(previous.width, previous.height, { preserveDynamics: true });
    }
  }

  async exportPng() {
    if (this.busy) return;
    this.setBusy(true);
    this.setStatus('Rendering PNG…', true);
    const height = Number(this.state.exportHeight);
    const width = Math.round(height * this.state.aspect);
    try {
      await this.withOutputSize(width, height, async () => {
        this.renderer.render(this.state);
        download(await canvasBlob(this.renderer.canvas, 'image/png'), 'png');
      });
      this.setStatus('PNG saved');
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  async exportWebm() {
    if (this.busy) return;
    if (!window.MediaRecorder) {
      this.setStatus('WebM recording is not supported in this browser.');
      return;
    }
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      this.setStatus('No supported WebM codec was found.');
      return;
    }

    this.setBusy(true);
    const height = Number(this.state.exportHeight);
    const width = Math.round(height * this.state.aspect);
    const duration = Number(this.state.duration);
    try {
      await this.withOutputSize(width, height, () => new Promise((resolve, reject) => {
        const stream = this.renderer.canvas.captureStream(30);
        const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
        const chunks = [];
        const started = performance.now();
        const progress = setInterval(() => {
          const elapsed = Math.min(duration, (performance.now() - started) / 1000);
          this.setStatus(`Recording WebM… ${elapsed.toFixed(1)} / ${duration}s`, true);
        }, 150);
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = event => reject(event.error || new Error('WebM recording failed.'));
        recorder.onstop = () => {
          clearInterval(progress);
          download(new Blob(chunks, { type: mime }), 'webm');
          resolve();
        };
        recorder.start();
        setTimeout(() => recorder.stop(), duration * 1000);
      }));
      this.setStatus('WebM saved');
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  async exportGif() {
    if (this.busy) return;
    this.setBusy(true);
    const duration = Number(this.state.duration);
    const width = duration > 6 ? 540 : 720;
    const height = Math.round(width / this.state.aspect);
    const fps = 12;
    const frameCount = duration * fps;
    const deltaTime = 1 / fps;
    const dynamicsSnapshot = this.renderer.snapshotDynamics();
    const wasPaused = this.state.paused;
    this.state.paused = true;

    try {
      await this.withOutputSize(width, height, async () => {
        const samples = [];
        const stride = Math.max(1, Math.floor(width * height * frameCount / 24_000));
        await this.renderGifPass(frameCount, deltaTime, imageData => {
          sampleFrame(imageData, stride, samples);
        }, 0, 42);

        this.setStatus('Building GIF palette…', true);
        const palette = buildPalette(new Uint8Array(samples), 256);
        const mapper = createPaletteMapper(palette);
        const frames = [];
        await this.renderGifPass(frameCount, deltaTime, imageData => {
          frames.push(indexFrame(imageData, mapper));
        }, 42, 92);

        this.setStatus('Encoding GIF… 96%', true);
        const gif = encodeGif(frames, width, height, palette, Math.round(100 / fps));
        download(new Blob([gif], { type: 'image/gif' }), 'gif');
      });
      this.setStatus('GIF saved');
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.renderer.restoreDynamics(dynamicsSnapshot);
      this.state.paused = wasPaused;
      this.setBusy(false);
    }
  }

  brushSampler() {
    const { bounds, scanTargets } = this.interaction;
    if (this.state.mode === 'words' && scanUnits(scanTargets, this.state.scan).length) {
      return time => ({ ...scanBrush(time, scanTargets, this.state), trail: false });
    }
    return time => {
      const point = autoBrushAt(time, bounds, this.state.autoSpeed, this.state.wobble);
      return { from: point, to: point, radius: this.state.brushSize, active: 1, step: 0, trail: true };
    };
  }

  async renderGifPass(frameCount, deltaTime, consumeFrame, startProgress, endProgress) {
    const scratch = document.createElement('canvas');
    scratch.width = this.renderer.width;
    scratch.height = this.renderer.height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    this.renderer.clearDynamics();
    const sampleBrush = this.brushSampler();
    let previous = null;

    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = frame * deltaTime;
      const current = sampleBrush(time);
      const continuous = current.trail && previous !== null && previous.step === current.step;
      this.renderer.stepHeat(deltaTime, {
        from: continuous ? previous.to : current.from,
        to: current.to,
        active: current.active,
        radius: current.radius
      }, this.state);
      this.renderer.stepGoo(deltaTime, this.state);
      this.renderer.render(this.state);
      context.drawImage(this.renderer.canvas, 0, 0);
      consumeFrame(context.getImageData(0, 0, scratch.width, scratch.height).data);
      previous = current;
      const progress = startProgress + (endProgress - startProgress) * (frame + 1) / frameCount;
      this.setStatus(`Rendering GIF… ${Math.round(progress)}%`, true);
      await nextTick();
    }
  }
}
