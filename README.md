# Terrarium Designer

A browser tool for designing an acrylic spider enclosure with printed corner brackets, a magnetic lid and an ESP32 camera. It shows a live 3D preview, checks the fit for 33 species, exports laser-cut SVG panels, and creates 3D-printable toys (STL).

```bash
npm install
npm run dev           # local dev server
npm run build         # static site in dist/
npm run build:single  # one self-contained HTML file in dist-single/ (opens from disk)
npm run preview       # serve the build
npm test              # fit checks, exports, toy mesh and printability tests
node tests/printability.mjs   # per-toy mesh and overhang report
```

## Putting it online

The workflow in `.github/workflows/pages.yml` builds and deploys to GitHub Pages when `main` changes.
One-time setup: merge this branch into `main`, then in the repository go to Settings, Pages, and set the source to "GitHub Actions".
Any static host also works: upload the contents of `dist/`, or just the single file from `npm run build:single`.

## Source layout

- `src/calc.js` geometry and fit checks
- `src/fit.js` smallest-box solver
- `src/species.js` species library
- `src/scene.js` three.js viewer, including drag-to-place for toys
- `src/toys.js` toy shapes (one watertight solid each), placement, sets, STL export
- `src/manifold.js` loads the boolean-geometry engine (WebAssembly)
- `src/printcheck.js` mesh and overhang checks
- `src/panels.js` SVG export, laser-bed packing, shopping list
- `src/esp32cam.ino` camera sketch (not compiled in this repo's tests)
- `src/main.js` UI

## Notes

Species leg spans are approximate and not checked against sources. Toys have been analysed for closed meshes and overhangs, but none has been sliced or printed.
