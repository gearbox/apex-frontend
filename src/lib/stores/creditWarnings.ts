import { writable, derived } from 'svelte/store';
import type { GpuSessionCreditWarningPayload } from '$lib/api/events';

export interface CreditWarning {
  session_id: string;
  level: 'warning' | 'critical';
  terminate_at: string | null;
  balance: number;
}

const { subscribe, update } = writable<Map<string, CreditWarning>>(new Map());

export const creditWarnings = { subscribe };

export function upsertCreditWarning(p: GpuSessionCreditWarningPayload): void {
  if (p.level === 'info') {
    dismissCreditWarning(p.session_id);
    return;
  }
  update((map) => {
    const next = new Map(map);
    next.set(p.session_id, {
      session_id: p.session_id,
      level: p.level as 'warning' | 'critical',
      terminate_at: p.terminate_at,
      balance: p.balance,
    });
    return next;
  });
}

export function dismissCreditWarning(session_id: string): void {
  update((map) => {
    const next = new Map(map);
    next.delete(session_id);
    return next;
  });
}

export function dismissAllCreditWarnings(): void {
  update(() => new Map());
}

/** The single most urgent warning for the global banner. Critical > warning; null terminate_at = most imminent. */
export const mostUrgentCreditWarning = derived(creditWarnings, ($map) => {
  const warnings = [...$map.values()];
  if (warnings.length === 0) return null;

  return warnings.sort((a, b) => {
    if (a.level !== b.level) {
      return a.level === 'critical' ? -1 : 1;
    }
    if (a.terminate_at === null && b.terminate_at !== null) return -1;
    if (a.terminate_at !== null && b.terminate_at === null) return 1;
    if (a.terminate_at === null && b.terminate_at === null) return 0;
    return Date.parse(a.terminate_at!) - Date.parse(b.terminate_at!);
  })[0];
});
