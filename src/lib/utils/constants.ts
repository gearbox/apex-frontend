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
  PUSH_ENDPOINT: 'apex:push:endpoint',
  PUSH_NUDGE_DISMISSED: 'apex:push:nudge-dismissed',
} as const;

/* ─── Breakpoints ─── */
export const BREAKPOINT_MD = 768;

/* ─── Job Polling ─── */
export const JOB_POLL_INTERVAL_MS = 2000;
export const POLL_INTERVAL_MS = 2000;
export const FRAME_POLL_INTERVAL_MS = 1000;
export const FRAME_POLL_BUDGET_MS = 7 * 60_000;
export const TERMINAL_JOB_STATUSES = ['completed', 'failed', 'cancelled', 'moderated'] as const;
export const ACTIVE_JOB_STATUSES = ['pending', 'queued', 'running'] as const;

/* ─── Gallery ─── */
export const GALLERY_PAGE_SIZE = 20;
export const UPLOADS_LIST_STALE_MS = 30 * 60 * 1000; // 30 min
export const GALLERY_CONTENT_STALE_MS = 10 * 60 * 1000; // 10 min — content proxy URLs are immutable

/* ─── Session Storage Keys ─── */
export const SESSION_KEYS = {
  ACTIVE_JOB: 'apex-active-job',
} as const;

/* ─── SSE / Real-Time Events ─── */
export const SSE_RECONNECT_BASE_MS = 2000;
export const SSE_RECONNECT_MAX_MS = 30_000;
export const SSE_MAX_CONSECUTIVE_FAILURES = 5;
export const SSE_FALLBACK_RETRY_MS = 60_000;
export const SSE_TICKET_RATE_LIMIT_BUFFER_MS = 500;

/* ─── Prompt Limits ─── */
export const MAX_PROMPT_LENGTH = 4096;

/* ─── Navigation Items ─── */
export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
}

export const TAB_ITEMS: NavItem[] = [
  { label: 'Create', href: '/app/create', icon: 'plus' },
  { label: 'Gallery', href: '/app/gallery', icon: 'image' },
];

export const MORE_ITEMS: NavItem[] = [
  { label: 'Billing & Tokens', href: '/app/billing', icon: 'coins' },
  { label: 'Job History', href: '/app/jobs', icon: 'activity' },
  { label: 'Profile & Settings', href: '/app/profile', icon: 'user' },
];

export const ADMIN_NAV_ITEM: NavItem = {
  label: 'Admin',
  href: '/app/admin',
  icon: 'shield',
};

export const ADMIN_MORE_ITEM: NavItem = {
  label: 'Admin Panel',
  href: '/app/admin',
  icon: 'shield',
};

/** All sidebar items for desktop (flat list) */
export const SIDEBAR_ITEMS: NavItem[] = [
  { label: 'Create', href: '/app/create', icon: 'plus' },
  { label: 'Gallery', href: '/app/gallery', icon: 'image' },
  { label: 'Jobs', href: '/app/jobs', icon: 'activity' },
  { label: 'Billing', href: '/app/billing', icon: 'coins' },
  { label: 'Profile', href: '/app/profile', icon: 'user' },
];
