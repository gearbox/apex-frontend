import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    alias: {
      $lib: './src/lib',
      '$paraglide/runtime': './src/paraglide/runtime.js',
      '$paraglide/messages': './src/paraglide/messages.js'
    }
  }
};

export default config;
