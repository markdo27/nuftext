# NUFTEXT

An interactive thermal typography tool for the browser. Move across the type to liquify its silhouette and raise a multi-band colour halo, or let the automatic scan animate it for you.

**Live:** https://markdo27.github.io/nuftext/

## What it does

- Keeps unheated text crisp while the active heat brush locally erodes the ink into downward molten runs.
- Uses a persistent WebGL heat field, so motion leaves a soft trail that fades naturally.
- Adds independent brush size and edge-blur controls for hard spotlights or broad feathered heat.
- Adapts Burnt-Noise's persistent mass/heat simulation so the source text loses material, drips away with its halo, then reforms slowly after cooling.
- Includes three reference-driven palettes: Acid Outline, Magenta Heat and Cyan Pink.
- Supports multiline text, six Google Fonts and local `.ttf`, `.otf`, `.woff` or `.woff2` uploads.
- Exports the current frame as PNG, live interaction as WebM and a deterministic Auto loop as GIF.

## Rendering pipeline

```text
Canvas text mask
  → pointer / Auto heat feedback texture
  → local mass + temperature melt simulation
  → dynamically deformed source mask
  → three relative-radius blur fields
  → palette-mapped contour halo
  → deformed ink + optional heated core
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

## Credits

The visual direction is based on supplied print and motion references. The browser GIF encoder is adapted from the earlier [Burnt-Noise](https://github.com/markdo27/Burnt-Noise) project.

## Licence

MIT
