# NUFTEXT

An interactive thermal typography tool for the browser. Move across the type to melt its silhouette into gooey blobs and raise a multi-band colour halo, or let the automatic scan animate it for you.

**Live:** https://markdo27.github.io/nuftext/

## What it does

- Keeps unheated text pixel-for-pixel crisp while the letters under the brush swell, fuse with their neighbours and neck apart like liquid.
- Uses a persistent WebGL heat field, so motion leaves a soft trail that fades naturally.
- Adds independent brush size and edge-blur controls for hard spotlights or broad feathered heat.
- Borrows the gooey trick from Codrops' Gooey Text Hover Effect — Gaussian blur followed by a hard alpha threshold — but drives the blur *locally* from the heat field instead of one global value, so only the heated letters turn to goo.
- Runs the heat through a viscous goo field with lateral surface tension, so blobs lag behind the pointer and merge with each other.
- Heat sustain keeps feeding the brush for a moment after the pointer leaves, so a quick hover still develops into a full blob instead of stopping dead.
- Goo rise and goo dwell are the two halves of an envelope measured in seconds: the letters swell gradually rather than snapping, hold, then settle back to crisp type.
- The ink stays its own colour and the palette renders as a contour halo hugging each letterform, so heated type reads as gooey letters rather than a blob of colour.
- Goo amount, spread, viscosity and threshold take the type from softly swollen, through merged metaballs, to shredded droplets.
- Goo dissolve fades the coverage before the threshold, the way the Codrops demo animates opacity: at `0` the heated letters only swell and fuse, and as it rises they neck, break into droplets and melt away entirely before reforming. The halo fades with the material it belongs to, so no flat disc of colour is left behind.
- Builds a gradient map by downscaling the mask, so heavier ink goos harder (density bias).
- Three interaction modes: Manual brush, Auto sweep across the block, and Words. Both automatic modes are pure functions of time, so the GIF export replays exactly what the canvas showed.
- Words selects by typographic unit rather than by position: the heat is a capsule sized to one whole character, word or line, so a word melts as a word. Each unit blooms and releases inside its own hold.
- Scan order is reading order, shuffled, or click to pick. The shuffle deals a permutation per round so every unit is visited once instead of drawing independently; pick holds the effect on whatever you click, which is the one to use for a still frame.
- Reading rhythm dwells on long units and skims short ones. It scales around the mean, so the average hold does not change with it.
- Scan voices runs up to four units at once, spaced an even share of a round apart, so the artwork always has one unit forming while another settles.
- Includes three reference-driven palettes: Acid Outline, Magenta Heat and Cyan Pink.
- Supports multiline text, six Google Fonts and local `.ttf`, `.otf`, `.woff` or `.woff2` uploads.
- Exports the current frame as PNG, live interaction as WebM and a deterministic Auto loop as GIF.

## Rendering pipeline

```text
Canvas text mask
  → downscaled density map (gradient map)
  → pointer / Auto sweep / word capsule heat feedback texture
  → viscous goo field (lateral diffusion + linear dwell settle)
  → blurred mask levels blended by local goo strength × density
  → alpha threshold → gooey metaball silhouette
  → three relative-radius blur fields
  → palette-mapped contour halo
  → gooey ink + optional heated core
  → print grain and colour misregistration
```

The application is completely client-side. Uploaded fonts never leave the browser.

## Development

There is no build step and no production dependency. Serve the repository with any static HTTP server:

```sh
python -m http.server 4173
```

Then open `http://localhost:4173/`.

Run the pure JavaScript tests with:

```sh
npm test
```

## Browser support

A current browser with WebGL and ES modules is required. WebM export depends on `MediaRecorder`; PNG and GIF remain available when the browser does not provide a WebM codec.

## Interface

The UI is built on the [ASTA design system](https://github.com/anton-io/asta) — a
monospace framework where every element aligns to a character grid. Tokens,
form components, the flat 2px-border language and the light/dark theming come
from ASTA; the app shell, sliders, palette editor and canvas stage are additions
for this tool.

Two departures from upstream are noted in `styles.css`: ASTA centres documents at
an 80ch measure, which a fixed control column beside a canvas cannot use, and its
`* + *` document rhythm is replaced by explicit spacing on the same line-height
scale. The chrome is kept strictly monochrome so the artwork is the only colour
on screen — state is shown by inversion rather than an accent.

Press the sun/moon button to switch theme. With no stored choice the system
preference decides.

## Credits

The visual direction is based on supplied print and motion references. The gooey
silhouette adapts the blur-plus-alpha-threshold technique from Codrops'
[Gooey Text Hover Effect](https://github.com/codrops/GooeyTextHoverEffect) (MIT).
The browser GIF encoder is adapted from the earlier
[Burnt-Noise](https://github.com/markdo27/Burnt-Noise) project.

- [ASTA](https://github.com/anton-io/asta) by Antonio Roldao — MIT
- [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) — SIL Open Font
  License 1.1, bundled in `fonts/` with its `OFL.txt` and `AUTHORS.txt`

## Licence

MIT
