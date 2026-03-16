import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

const productId = process.env.VITE_PRODUCT_ID || 'vex';

const productManifests: Record<string, {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
}> = {
  vex: {
    name: 'vex.pics',
    short_name: 'vex.pics',
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
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        ...manifest,
        display: 'standalone',
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/v1\/billing\/(packages|pricing)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'billing-cache',
              expiration: { maxAgeSeconds: 3600 },
            },
          },
          {
            urlPattern: /\/v1\/grok\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'provider-cache',
              expiration: { maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
  ],
});
