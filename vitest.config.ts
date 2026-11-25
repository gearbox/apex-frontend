import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { APP_VERSION, BUILD_SHA } from './build-meta.js';
import { resolveBuildProductForMode } from './product-manifests.js';
import { paraglideConfig } from './paraglide.config.js';

const { id: productId, manifest } = resolveBuildProductForMode('test');

export default defineConfig({
  plugins: [paraglideVitePlugin(paraglideConfig), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __PRODUCT_ID__: JSON.stringify(productId),
    __PRODUCT_NAME__: JSON.stringify(manifest.name),
    __PRODUCT_SHORT_NAME__: JSON.stringify(manifest.short_name),
    __PRODUCT_THEME_COLOR__: JSON.stringify(manifest.theme_color),
  },
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
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    setupFiles: ['./src/tests/setup.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
});
