import { get } from 'svelte/store';
import { locale } from '$lib/stores/locale';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 604800;
const MONTH = 2592000;
const YEAR = 31536000;

/** Get the current locale string for Intl APIs. */
function currentLocale(): string {
  return get(locale);
}

/** Format a date string as relative time (e.g. "3h ago"). */
export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
  if (seconds < WEEK) return `${Math.floor(seconds / DAY)}d ago`;
  if (seconds < MONTH) return `${Math.floor(seconds / WEEK)}w ago`;
  if (seconds < YEAR) return `${Math.floor(seconds / MONTH)}mo ago`;
  return `${Math.floor(seconds / YEAR)}y ago`;
}

/** Format a date string as locale-aware medium date. e.g. "Mar 14, 2026" */
export function formatDate(iso: string, localeOverride?: string): string {
  return new Intl.DateTimeFormat(localeOverride ?? currentLocale(), {
    dateStyle: 'medium',
  }).format(new Date(iso));
}

/** Format a number with locale separators. e.g. 1247 → "1,247" (en) / "1.247" (sr) */
export function formatNumber(n: number, localeOverride?: string): string {
  return new Intl.NumberFormat(localeOverride ?? currentLocale()).format(n);
}

/** Format USD currency. e.g. "$12.50" */
export function formatUsd(price: string | number, localeOverride?: string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return new Intl.NumberFormat(localeOverride ?? currentLocale(), {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

/** Format a token amount with the ◈ symbol. */
export function formatTokens(amount: number): string {
  return `◈ ${formatNumber(amount)}`;
}

/** Format file size in human-readable form. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Truncate text with ellipsis. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/** Format relative time from ISO string. e.g. "2m ago", "1h ago", "3d ago" */
export function formatRelativeTime(iso: string): string {
  return timeAgo(iso);
}

/** Format file size in human-readable form. e.g. "1.4 MB", "340 KB" */
export function formatFileSize(bytes: number): string {
  return formatBytes(bytes);
}
