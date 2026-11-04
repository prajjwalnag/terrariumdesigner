# Terrarium Designer

A browser tool for designing an acrylic spider enclosure with printed corner brackets, a magnetic lid and an ESP32 camera. It shows a live 3D preview, checks the fit for your spider, and exports laser-cut SVG panels plus a shopping list.

```bash
npm install
npm run dev      # local dev server
npm run build    # static site in dist/
npm run preview  # serve the build
npm test         # fit-check and export tests
```

Source layout: `src/calc.js` (geometry and fit checks), `src/scene.js` (three.js viewer), `src/panels.js` (SVG export, sheet packing, shopping list), `src/state.js` (saved state, share links), `src/main.js` (UI).
