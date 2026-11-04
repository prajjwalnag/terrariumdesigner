import Module from 'manifold-3d';

// In the browser Vite supplies the wasm file's URL; in Node (tests) the package finds it itself.
const wasmUrl = typeof window === 'undefined' ? null : (await import('manifold-3d/manifold.wasm?url')).default;
const wasm = await Module(wasmUrl ? { locateFile: () => wasmUrl } : {});
wasm.setup();
export const { Manifold } = wasm;
