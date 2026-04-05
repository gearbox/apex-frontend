/// <reference types="@sveltejs/kit" />
/// <reference types="@vite-pwa/sveltekit/info" />
declare App {
  // interface Error {}
  // interface Locals {}
  // interface PageData {}
  // interface PageState {}
}

declare global {
  namespace App {
    interface Platform {
      env: Env;
      ctx: ExecutionContext;
      caches: CacheStorage;
      cf?: IncomingRequestCfProperties
    }
  }
}

/// <reference types="@vite-pwa/sveltekit/info" />
// interface Error {}
// interface Locals {}
// interface PageData {}
// interface PageState {}
