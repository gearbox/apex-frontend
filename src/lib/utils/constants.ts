/** API base URL — injected via Vite env */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/* ─── Upload Media ─── */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const ACCEPTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

/* ─── LocalStorage Keys ─── */
export const STORAGE_KEYS = {
  THEME_PREFS: 'apex-theme-prefs',
  REFRESH_TOKEN: 'apex-refresh-token',
  SIDEBAR_COLLAPSED: 'apex-sidebar-collapsed',
  PWA_INSTALL_DISMISSED: 'apex-pwa-install-dismissed',
  VPDEBUG: 'apex-vpdebug',
  PUSH_REGISTRATION: 'apex:push:registration',
  PUSH_PROMPT_STATE: 'apex:push:prompt-state',
} as const;

/* ─── Breakpoints ─── */
export const BREAKPOINT_MD = 768;
export const POLL_INTERVAL_MS = 2000;
export const TERMINAL_JOB_STATUSES = ['completed', 'failed', 'cancelled', 'moderated'] as const;

/* ─── Library ─── */
export const LIBRARY_PAGE_SIZE = 30;
export const LIBRARY_LIST_STALE_MS = 5 * 60 * 1000; // 5 min
export const LIBRARY_ASSET_STALE_MS = 10 * 60 * 1000; // 10 min — content proxy URLs are immutable
/** Assets expiring within this window show a warning in the UI. */
export const EXPIRES_SOON_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ─── Session Storage Keys ─── */
export const SESSION_KEYS = {
  ACTIVE_JOB: 'apex-active-job',
  /** Set right before the 401 middleware's hard redirect; consumed once by the login screen. */
  AUTH_FAILURE_REASON: 'apex-auth-failure-reason',
  /** Short-lived, tab-scoped handoff from the OAuth fragment dispatcher to its signup form. */
  OAUTH_PENDING_SIGNUP: 'apex:oauth:pending-signup',
} as const;

/* ─── SSE / Real-Time Events ─── */
export const SSE_RECONNECT_BASE_MS = 2000;
export const SSE_RECONNECT_MAX_MS = 30_000;
export const SSE_MAX_CONSECUTIVE_FAILURES = 5;
export const SSE_FALLBACK_RETRY_MS = 60_000;

/* ─── Prompt Limits ─── */
export const MAX_PROMPT_LENGTH = 4096;
