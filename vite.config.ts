import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  assetsInclude: ['**/*.glb', '**/*.vrm'],
  build: {
    target: 'es2022',
    assetsInlineLimit: 10_000_000,
    cssCodeSplit: false,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});