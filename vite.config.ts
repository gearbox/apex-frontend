import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    paraglide({ project: './project.inlang', outdir: './src/paraglide' }),
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Apex — AI Content Studio',
        short_name: 'Apex',
        description: 'AI-powered image and video generation platform',
        display: 'standalone',
        theme_color: '#110f0b',
        background_color: '#110f0b',
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
