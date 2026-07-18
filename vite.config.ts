import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';
import { APP_VERSION, BUILD_SHA } from './build-meta.js';
import { appVersionManifestPlugin } from './build-version-manifest.js';

const productId = process.env.VITE_PRODUCT_ID || 'vex';

const productManifests: Record<
  string,
  {
    name: string;
    short_name: string;
    description: string;
    theme_color: string;
    background_color: string;
  }
> = {
  vex: {
    name: 'Vex.pics',
    short_name: 'Vex.pics',
    description: 'AI-powered image and video generation',
    theme_color: '#110f0b',
    background_color: '#110f0b',
  },
  synthara: {
    name: 'Synthara',
    short_name: 'Synthara',
    description: 'AI-powered image and video generation for professionals',
    theme_color: '#0f1117',
    background_color: '#0f1117',
  },
};

const manifest = productManifests[productId] ?? productManifests.vex;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/svelte/')) {
            return 'svelte-vendor';
          }
        },
      },
    },
  },
  plugins: [
    paraglide({ project: './project.inlang', outdir: './src/paraglide' }),
    tailwindcss(),
    sveltekit(),
    // This is deliberately emitted at build time rather than checked in under
    // static/. Workbox's glob below excludes JSON, so it can never become a
    // stale precache entry.
    appVersionManifestPlugin({ version: APP_VERSION, buildSha: BUILD_SHA }),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      // Custom SW (push notifications need push/notificationclick/pushsubscriptionchange
      // handlers, which generateSW's declarative config can't express).
      // @vite-pwa/sveltekit's injectManifest strategy rides on SvelteKit's native
      // service worker pipeline: the source lives at src/service-worker.ts (SvelteKit
      // builds/bundles it), and workbox-build then injects the precache manifest into
      // the already-built output in place. It reproduces the previous generateSW
      // behavior exactly — see comments in src/service-worker.ts.
      strategies: 'injectManifest',
      // Absolute base + scope: this is an SPA (ssr=false) whose root route
      // client-redirects to /app/create. The plugin's default relative './'
      // scope resolves against whatever URL is current when registerSW() runs
      // (e.g. /app/gallery), producing the wrong SW scope and a 404 for the
      // script. Forcing absolute paths makes registration scope-correct from
      // any route.
      base: '/',
      scope: '/',
      manifest: {
        ...manifest,
        // Stable app identity for installed-app/Focus synchronization. Product builds deploy separately.
        id: '/',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
});
