import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` makes a normal static site in dist/.
// `npm run build:single` makes one self-contained HTML file (dist-single/index.html) that opens straight from disk.
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  build: {
    chunkSizeWarningLimit: 1500,
    target: 'es2022', // top-level await (used to load the geometry engine)
    assetsInlineLimit: single ? 10_000_000 : 4096, // inline the wasm file in the single-file build
    outDir: single ? 'dist-single' : 'dist',
  },
});
