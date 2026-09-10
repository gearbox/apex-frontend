import type { components } from '$lib/api/types';

export type OperationWork = components['schemas']['OperationWorkResponse'];

export function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, progress));
}

/** Shared by session uptime and operation elapsed/ETA display — an invalid timestamp yields null. */
export function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '0 B';
  const absolute = Math.abs(bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = absolute;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const precision = value >= 10 || unit === 0 || Number.isInteger(value) ? 0 : 1;
  return `${bytes < 0 ? '-' : ''}${value.toFixed(precision)} ${units[unit]}`;
}

export function formatOperationValue(value: number, unit: OperationWork['unit']): string {
  return unit === 'bytes' ? formatBytes(value) : value.toLocaleString();
}

export function formatOperationRate(rate: components['schemas']['OperationRateResponse']): string {
  // The generated contract currently supports bytes_per_second. Keep the formatting tied to the
  // supplied unit instead of deriving it from timestamps or work totals.
  return rate.unit === 'bytes_per_second' ? `${formatBytes(rate.value)}/s` : `${rate.value}/s`;
}

export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

/** Coarse configured hints are intentionally not rendered as a live countdown. */
export function formatTypicalDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${rounded}s`;
}
