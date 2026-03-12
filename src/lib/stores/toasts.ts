import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  durationMs?: number; // default 4000, 0 = persist
  action?: { label: string; href?: string; onClick?: () => void };
}

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = { subscribe };

export function addToast(toast: Omit<Toast, 'id'>): string {
  const id = crypto.randomUUID();
  const durationMs = toast.durationMs ?? 4000;
  update((all) => [...all, { ...toast, id, durationMs }]);
  if (durationMs > 0) {
    setTimeout(() => removeToast(id), durationMs);
  }
  return id;
}

export function removeToast(id: string): void {
  update((all) => all.filter((t) => t.id !== id));
}
