import type { InitialMemory, MemoryFormPayload } from '$lib/components/studio/MemoryForm.svelte';

export function toInitialMemory(payload: MemoryFormPayload): InitialMemory {
  return { ...payload, occurred_on: payload.occurred_on ?? null };
}

/** Proposes a one-line diary title from the first non-blank body line. */
export function deriveMemoryTitle(body: string): string {
  const firstLine = body
    .normalize('NFC')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  if (!firstLine) return '';

  const collapsed = firstLine.trim().replace(/\s+/gu, ' ');
  const points = Array.from(collapsed);
  if (points.length <= 120) return collapsed;

  const prefix = points.slice(0, 120);
  const cutAt = prefix.lastIndexOf(' ');
  return (cutAt >= 60 ? prefix.slice(0, cutAt) : prefix).join('').trimEnd();
}

/** Returns a YYYY-MM-DD date in the user's local time zone. */
export function todayLocalIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Formats a date-only string as a local date without UTC date shifting. */
export function formatLocalIsoDate(value: string, locale: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(year, month - 1, day),
  );
}
