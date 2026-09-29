import type { ClientInit } from '@sveltejs/kit';
import { captureOAuthCallbackFragment } from '$lib/api/oauthFragment';

/** Strip one-time OAuth callback fragments before SvelteKit initializes the application. */
export const init: ClientInit = () => {
  captureOAuthCallbackFragment();
};
