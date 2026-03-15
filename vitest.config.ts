import path from 'node:path';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [paraglide({ project: './project.inlang', outdir: './src/paraglide' }), sveltekit()],
  resolve: {
    alias: {
      '$paraglide/runtime': path.resolve('./src/paraglide/runtime.js'),
      '$paraglide/messages': path.resolve('./src/paraglide/messages.js'),
    },
    conditions: ['browser'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/tests/setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
});
