import { defineConfig } from 'vite';

// The hosted studio at studio.apicommons.org. Entry is the repo-root index.html;
// the SPA imports the SAME shared emitter (src/emit-ruleset.js) the CLI uses, so
// the YAML you copy from the browser is byte-identical to what the CLI writes.
// Output goes to dist/, which the Pages workflow uploads.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
