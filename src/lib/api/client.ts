import createClient, { type Middleware } from 'openapi-fetch';
import { API_BASE_URL } from '$lib/utils/constants';
import { getAccessToken } from '$lib/stores/auth';
import { silentRefresh } from '$lib/api/auth';
import type { paths } from './types';

/* ─── Auth Middleware ─── */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = getAccessToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },

  async onResponse({ response, request }) {
    if (response.status !== 401) return response;

    // Attempt refresh
    const refreshed = await silentRefresh();
    if (!refreshed) {
      // Redirect to login, preserving current path
      if (typeof window !== 'undefined') {
        const redirect = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?redirect=${redirect}`;
      }
      return response;
    }

    // Retry original request with new token
    const newToken = getAccessToken();
    if (newToken) {
      request.headers.set('Authorization', `Bearer ${newToken}`);
    }
    return fetch(request);
  },
};

/* ─── Client Instance ─── */
const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });
apiClient.use(authMiddleware);

export default apiClient;
