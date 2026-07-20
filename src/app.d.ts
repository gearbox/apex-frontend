/// <reference types="@sveltejs/kit" />

declare namespace App {
  // interface Error {}
  // interface Locals {}
  // interface PageData {}
  // interface PageState {}
  // interface Platform {}
}

// vite-plugin-pwa virtual modules — declared inline because vite-plugin-pwa is
// only a transitive dependency (via @vite-pwa/sveltekit) and isn't hoisted by pnpm,
// so `/// <reference types="vite-plugin-pwa/..." />` can't resolve.
declare module 'virtual:pwa-info' {
  export interface PwaInfo {
    webManifest: {
      href: string;
      useCredentials: boolean;
      linkTag: string;
    };
  }
  export const pwaInfo: PwaInfo | undefined;
}

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (
      swScriptUrl: string,
      registration: ServiceWorkerRegistration | undefined,
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }
  /** The returned generic update helper is intentionally never used by the app. */
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
