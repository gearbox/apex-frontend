import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false,
      strict: true,
    }),

    alias: {
      $lib: './src/lib',
      '$paraglide/runtime': './src/paraglide/runtime.js',
      '$paraglide/messages': './src/paraglide/messages.js',
    },

    // Registration is handled manually via virtual:pwa-register (src/routes/+layout.svelte)
    // so the app controls update prompting; disable SvelteKit's own auto-registration
    // to avoid a second, competing service worker registration.
    serviceWorker: {
      register: false,
    },
  },
};

export default config;
