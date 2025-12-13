import type { Options } from 'tsup';

export default <Options>{
    entry: ['index.ts', 'src/**/*.ts'],
    format: ['esm'],
    target: 'node18',
    clean: true,
    bundle: true,
    sourcemap: true,
    dts: true,
    minify: false,
    splitting: true,
    outDir: 'dist',
    shims: true, // Enable shims (including __require shim for legacy deps)
    banner: {
        js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
    },
};
