import { hexToRgb } from './math.js';

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const COPY_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
void main(){
  float value = texture2D(uSource, vUv).a;
  gl_FragColor = vec4(value, value, value, value);
}`;

const BLUR_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uDirection;
uniform float uRadius;
void main(){
  vec2 offset = uTexel * uDirection * max(uRadius, 0.01);
  float value = texture2D(uSource, vUv).a * 0.227027;
  value += texture2D(uSource, vUv + offset * 1.384615).a * 0.316216;
  value += texture2D(uSource, vUv - offset * 1.384615).a * 0.316216;
  value += texture2D(uSource, vUv + offset * 3.230769).a * 0.070270;
  value += texture2D(uSource, vUv - offset * 3.230769).a * 0.070270;
  gl_FragColor = vec4(value, value, value, value);
}`;

const HEAT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPrevious;
uniform vec2 uTexel;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uAspect;
uniform float uDecay;
uniform float uRadius;
uniform float uStrength;
uniform float uActive;

float segmentDistance(vec2 point, vec2 start, vec2 end){
  vec2 delta = end - start;
  float lengthSquared = max(dot(delta, delta), 0.000001);
  float position = clamp(dot(point - start, delta) / lengthSquared, 0.0, 1.0);
  return length(point - (start + delta * position));
}

void main(){
  float previous = texture2D(uPrevious, vUv).r;
  float neighbours = texture2D(uPrevious, vUv + vec2(uTexel.x, 0.0)).r
                   + texture2D(uPrevious, vUv - vec2(uTexel.x, 0.0)).r
                   + texture2D(uPrevious, vUv + vec2(0.0, uTexel.y)).r
                   + texture2D(uPrevious, vUv - vec2(0.0, uTexel.y)).r;
  previous = mix(previous, neighbours * 0.25, 0.035) * uDecay;
  vec2 point = vec2(vUv.x * uAspect, vUv.y);
  vec2 start = vec2(uFrom.x * uAspect, uFrom.y);
  vec2 end = vec2(uTo.x * uAspect, uTo.y);
  float distanceToBrush = segmentDistance(point, start, end);
  float injection = exp(-4.0 * distanceToBrush * distanceToBrush / max(uRadius * uRadius, 0.00001));
  injection *= uStrength * uActive;
  float heat = max(previous, clamp(injection, 0.0, 1.0));
  gl_FragColor = vec4(heat, heat, heat, 1.0);
}`;

const COMPOSITE_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMask;
uniform sampler2D uSmall;
uniform sampler2D uMedium;
uniform sampler2D uLarge;
uniform sampler2D uHeat;
uniform vec3 uBackground;
uniform vec3 uPaperTint;
uniform vec3 uTextColor;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec2 uMaskTexel;
uniform float uCoreColor;
uniform float uIntensity;
uniform float uMisregistration;
uniform float uGrain;
uniform float uGrainSize;
uniform float uFrame;

float hash21(vec2 point){
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

vec3 palette(float value){
  value = clamp(value, 0.0, 1.0);
  if(value < 0.333333) return mix(uColor0, uColor1, value * 3.0);
  if(value < 0.666667) return mix(uColor1, uColor2, (value - 0.333333) * 3.0);
  return mix(uColor2, uColor3, (value - 0.666667) * 3.0);
}

vec3 overlay(vec3 base, vec3 blend){
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}

void main(){
  float mask = texture2D(uMask, vUv).a;
  float smallField = texture2D(uSmall, vUv).a;
  float mediumField = texture2D(uMedium, vUv).a;
  float largeField = texture2D(uLarge, vUv).a;
  float heat = texture2D(uHeat, vUv).r;
  float heatGate = smoothstep(0.025, 0.35, heat);

  float profile = max(smallField, max(mediumField * 0.88, largeField * 0.58));
  float palettePosition = clamp(pow(profile, 0.72) * uIntensity, 0.0, 1.0);
  float haloCoverage = smoothstep(0.008, 0.12, profile) * heatGate;

  float paperNoise = hash21(floor(gl_FragCoord.xy / 17.0));
  vec3 colour = mix(uBackground, uPaperTint, 0.08 + paperNoise * 0.04);
  colour = mix(colour, palette(palettePosition), clamp(haloCoverage * uIntensity, 0.0, 1.0));

  vec2 shift = vec2(uMaskTexel.x * uMisregistration, 0.0);
  float redFringe = max(texture2D(uMask, vUv + shift).a - mask, 0.0);
  float cyanFringe = max(texture2D(uMask, vUv - shift).a - mask, 0.0);
  colour = mix(colour, uColor2, redFringe * (0.25 + 0.75 * heatGate));
  colour = mix(colour, uColor0, cyanFringe * (0.25 + 0.75 * heatGate));

  vec3 heatedInk = palette(max(0.76, palettePosition));
  vec3 ink = mix(uTextColor, heatedInk, heatGate * uCoreColor);
  colour = mix(colour, ink, mask);

  float fine = hash21(floor(gl_FragCoord.xy / max(uGrainSize, 1.0)) + uFrame * 0.173);
  colour = mix(colour, overlay(colour, vec3(fine)), uGrain);
  gl_FragColor = vec4(clamp(colour, 0.0, 1.0), 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Shader compilation failed.');
  }
  return shader;
}

function createProgram(gl, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed.');
  }
  program.uniforms = new Map();
  return program;
}

function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createRenderTarget(gl) {
  return { texture: createTexture(gl), framebuffer: gl.createFramebuffer(), width: 0, height: 0 };
}

function resizeRenderTarget(gl, target, width, height) {
  if (target.width === width && target.height === height) return;
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('Could not create a complete WebGL framebuffer.');
  }
}

export class ThermalRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('WebGL unavailable.');
    this.copyProgram = createProgram(this.gl, COPY_SHADER);
    this.blurProgram = createProgram(this.gl, BLUR_SHADER);
    this.heatProgram = createProgram(this.gl, HEAT_SHADER);
    this.compositeProgram = createProgram(this.gl, COMPOSITE_SHADER);
    this.maskTexture = createTexture(this.gl);
    this.small = [createRenderTarget(this.gl), createRenderTarget(this.gl)];
    this.medium = [createRenderTarget(this.gl), createRenderTarget(this.gl)];
    this.large = [createRenderTarget(this.gl), createRenderTarget(this.gl)];
    this.heat = [createRenderTarget(this.gl), createRenderTarget(this.gl)];
    this.heatIndex = 0;
    this.maskRevision = 0;
    this.fieldSignature = '';
    this.frame = 0;
    this.setupQuad();
  }

  setupQuad() {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    this.quadBuffer = buffer;
  }

  uniform(program, name) {
    if (!program.uniforms.has(name)) program.uniforms.set(name, this.gl.getUniformLocation(program, name));
    return program.uniforms.get(name);
  }

  use(program) {
    const gl = this.gl;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const location = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  }

  draw(program, target = null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
    gl.viewport(0, 0, target?.width || this.width, target?.height || this.height);
    this.use(program);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  bindTexture(program, name, texture, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uniform(program, name), unit);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    const sizes = [
      [this.small, Math.ceil(width / 2), Math.ceil(height / 2)],
      [this.medium, Math.ceil(width / 4), Math.ceil(height / 4)],
      [this.large, Math.ceil(width / 8), Math.ceil(height / 8)]
    ];
    sizes.forEach(([pair, targetWidth, targetHeight]) => pair.forEach(target =>
      resizeRenderTarget(this.gl, target, Math.max(2, targetWidth), Math.max(2, targetHeight))));
    this.resizeHeat(width / height);
    this.fieldSignature = '';
  }

  resizeHeat(aspect) {
    const height = 384;
    const width = Math.max(2, Math.round(height * aspect));
    if (this.heat[0].width === width && this.heat[0].height === height) return;
    this.heat.forEach(target => resizeRenderTarget(this.gl, target, width, height));
    this.clearHeat();
  }

  uploadMask(sourceCanvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.maskRevision += 1;
    this.fieldSignature = '';
  }

  clearTarget(target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  clearHeat() {
    this.heat.forEach(target => this.clearTarget(target));
    this.heatIndex = 0;
  }

  copyTo(source, target) {
    this.use(this.copyProgram);
    this.bindTexture(this.copyProgram, 'uSource', source, 0);
    this.draw(this.copyProgram, target);
  }

  blurPair(pair, radius) {
    const gl = this.gl;
    const passes = Math.max(1, Math.ceil((radius / 2) ** 2));
    const passRadius = radius / Math.sqrt(passes);
    for (let pass = 0; pass < passes; pass += 1) {
      this.use(this.blurProgram);
      this.bindTexture(this.blurProgram, 'uSource', pair[0].texture, 0);
      gl.uniform2f(this.uniform(this.blurProgram, 'uTexel'), 1 / pair[0].width, 1 / pair[0].height);
      gl.uniform2f(this.uniform(this.blurProgram, 'uDirection'), 1, 0);
      gl.uniform1f(this.uniform(this.blurProgram, 'uRadius'), passRadius);
      this.draw(this.blurProgram, pair[1]);
      this.bindTexture(this.blurProgram, 'uSource', pair[1].texture, 0);
      gl.uniform2f(this.uniform(this.blurProgram, 'uDirection'), 0, 1);
      this.draw(this.blurProgram, pair[0]);
    }
  }

  rebuildFields(state) {
    const signature = `${this.maskRevision}:${this.width}:${state.contourWidth}:${state.glowRadius}`;
    if (signature === this.fieldSignature) return;
    this.copyTo(this.maskTexture, this.small[0]);
    this.blurPair(this.small, 0.7 + state.contourWidth * 4.5);
    this.copyTo(this.maskTexture, this.medium[0]);
    this.blurPair(this.medium, 1.4 + state.contourWidth * 6.5);
    this.copyTo(this.maskTexture, this.large[0]);
    this.blurPair(this.large, 2.0 + state.glowRadius * 10.0);
    this.fieldSignature = signature;
  }

  stepHeat(deltaTime, from, to, active, state) {
    const gl = this.gl;
    const source = this.heat[this.heatIndex];
    const target = this.heat[1 - this.heatIndex];
    const halfLife = 0.08 + state.trail * 1.8;
    const decay = Math.pow(0.5, deltaTime / halfLife);
    this.use(this.heatProgram);
    this.bindTexture(this.heatProgram, 'uPrevious', source.texture, 0);
    gl.uniform2f(this.uniform(this.heatProgram, 'uTexel'), 1 / source.width, 1 / source.height);
    gl.uniform2f(this.uniform(this.heatProgram, 'uFrom'), from.x, 1 - from.y);
    gl.uniform2f(this.uniform(this.heatProgram, 'uTo'), to.x, 1 - to.y);
    gl.uniform1f(this.uniform(this.heatProgram, 'uAspect'), this.width / this.height);
    gl.uniform1f(this.uniform(this.heatProgram, 'uDecay'), decay);
    gl.uniform1f(this.uniform(this.heatProgram, 'uRadius'), state.brushSize);
    gl.uniform1f(this.uniform(this.heatProgram, 'uStrength'), state.heatStrength);
    gl.uniform1f(this.uniform(this.heatProgram, 'uActive'), active ? 1 : 0);
    this.draw(this.heatProgram, target);
    this.heatIndex = 1 - this.heatIndex;
  }

  render(state) {
    this.rebuildFields(state);
    const gl = this.gl;
    const program = this.compositeProgram;
    this.use(program);
    this.bindTexture(program, 'uMask', this.maskTexture, 0);
    this.bindTexture(program, 'uSmall', this.small[0].texture, 1);
    this.bindTexture(program, 'uMedium', this.medium[0].texture, 2);
    this.bindTexture(program, 'uLarge', this.large[0].texture, 3);
    this.bindTexture(program, 'uHeat', this.heat[this.heatIndex].texture, 4);
    this.setColor(program, 'uBackground', state.backgroundColor);
    this.setColor(program, 'uPaperTint', state.paperTint);
    this.setColor(program, 'uTextColor', state.textColor);
    state.palette.forEach((color, index) => this.setColor(program, `uColor${index}`, color));
    gl.uniform2f(this.uniform(program, 'uMaskTexel'), 1 / this.width, 1 / this.height);
    gl.uniform1f(this.uniform(program, 'uCoreColor'), state.coreColorization);
    gl.uniform1f(this.uniform(program, 'uIntensity'), state.effectIntensity);
    gl.uniform1f(this.uniform(program, 'uMisregistration'), state.misregistration * this.width);
    gl.uniform1f(this.uniform(program, 'uGrain'), state.grain);
    gl.uniform1f(this.uniform(program, 'uGrainSize'), state.grainSize);
    gl.uniform1f(this.uniform(program, 'uFrame'), this.frame % 2048);
    this.draw(program);
    this.frame += 1;
  }

  setColor(program, name, hex) {
    this.gl.uniform3fv(this.uniform(program, name), hexToRgb(hex));
  }

  snapshotHeat() {
    const gl = this.gl;
    const target = this.heat[this.heatIndex];
    const pixels = new Uint8Array(target.width * target.height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels, width: target.width, height: target.height };
  }

  restoreHeat(snapshot) {
    const gl = this.gl;
    const target = this.heat[this.heatIndex];
    if (snapshot.width !== target.width || snapshot.height !== target.height) return;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, snapshot.pixels);
  }
}
