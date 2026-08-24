# NUFTEXT

Generative type tools for the browser. Three single-file HTML tools that build
poster typography out of noise fields, fluid simulation and colour ramps.
No build step, no dependencies, no backend — each file runs on its own.

**Live:** https://markdo27.github.io/nuftext/

| File | What it is |
|---|---|
| [`nuftext-studio.html`](nuftext-studio.html) | **Nuftext Studio** — layered poster generator on a thermal halo pipeline |
| [`scorch.html`](scorch.html) | **Scorch / Noise** — burnt text generator (WebGL) |
| [`liquid-glow.html`](liquid-glow.html) | **Liquid / Glow** — melt typography via SVG filter chains |

---

## Nuftext Studio

Fuses two earlier projects — [nuf_pattern](https://github.com/markdo27/nuf_pattern)
(pattern modes) and [Burnt-Noise](https://github.com/markdo27/Burnt-Noise)
(melt simulation) — and runs both through a thermal halo pipeline adapted from
a camera-silhouette tool, with artwork replacing the webcam as the source.

### Pipeline

```
SOURCE      text mask (+ melt sim, burnt edges)  ·  nuf pattern density field
SILHOUETTE  threshold, with sensitivity + invert
BLOB        blur → contrast boost
HALO        blur again, much wider
PALETTE     halo brightness → RGBA gradient lookup
COMPOSITE   background fill → pattern layer → text layer, via blend modes
POST        grain in overlay mode, contrast, vignette
```

### Features

- **Layers** — text, pattern and background fill, each with visibility, opacity
  and 12 blend modes. Optionally merge the text and pattern silhouettes *before*
  the halo blur so one continuous glow wraps both.
- **Editable RGBA palette** — draggable gradient stops carrying position, colour
  and opacity, plus four presets and a mirrored ramp mode.
- **Melt simulation** — a persistent state buffer (displacement, velocity, mass,
  heat) integrated over time, so runs accelerate under gravity, material is
  conserved, and drips neck and swell rather than merely sagging.
- **12 pattern modes** — blobs, rows, dots, diamonds, rings, waves, stripes,
  hexagons, starfruit, zigzag, polka dots, and a compact-support metaball mode.
- **Typography** — justified stacks that size each line independently to fill the
  column, adjustable tracking and leading, and runtime font upload
  (`.ttf` / `.otf` / `.woff`).
- **Export** — PNG up to 3200px, and WebM capture.

### A note on the palette

Stop **opacity is the alpha cutout**. A cold stop at 0% opacity is what lets the
background fill show through wherever the field runs cold, and moving that stop
opens or closes the silhouette. Colour and alpha interpolate independently in
straight (non-premultiplied) space — interpolating premultiplied, as canvas
gradients do, drags every colour toward black as it approaches a transparent
stop, which would darken the cold end of every palette instead of fading it out.

---

## Requirements

- **WebGL** for Nuftext Studio and Scorch. Both use half-float render targets
  where available and fall back to 8-bit otherwise.
- **SVG filter support** for Liquid / Glow — no WebGL needed.

Display faces load from Google Fonts; everything else is inline. Once a page has
loaded it runs offline.

## Licence

MIT
