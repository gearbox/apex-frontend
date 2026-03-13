/** API base URL — injected via Vite env */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

/* ─── LocalStorage Keys ─── */
export const STORAGE_KEYS = {
  THEME_PREFS: 'apex-theme-prefs',
  REFRESH_TOKEN: 'apex-refresh-token',
  SIDEBAR_COLLAPSED: 'apex-sidebar-collapsed',
} as const;

/* ─── Breakpoints ─── */
export const BREAKPOINT_MD = 768;

/* ─── Job Polling ─── */
export const JOB_POLL_INTERVAL_MS = 2000;
export const POLL_INTERVAL_MS = 2000;
export const TERMINAL_JOB_STATUSES = ['completed', 'failed', 'cancelled', 'moderated'] as const;
export const ACTIVE_JOB_STATUSES = ['pending', 'queued', 'running'] as const;

/* ─── Gallery ─── */
export const GALLERY_PAGE_SIZE = 20;
export const PRESIGNED_URL_STALE_MS = 30 * 60 * 1000; // 30 min

/* ─── Session Storage Keys ─── */
export const SESSION_KEYS = {
  ACTIVE_JOB: 'apex-active-job',
} as const;

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
