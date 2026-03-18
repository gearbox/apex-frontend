import { writable, derived } from 'svelte/store';
import type { SystemNotificationPayload, SystemNotificationLevel } from '$lib/api/events';

export interface SystemNotification {
  id: string;
  level: SystemNotificationLevel;
  title: string;
  message: string;
  expires_at: Date | null;
  received_at: Date;
}

const { subscribe, update, set } = writable<SystemNotification[]>([]);

export const notifications = { subscribe };

/** Active (non-expired) notifications, most critical first */
export const activeNotifications = derived(
  { subscribe },
  ($all) => {
    const now = new Date();
    return $all
      .filter((n) => !n.expires_at || n.expires_at > now)
      .sort((a, b) => {
        const levelOrder: Record<SystemNotificationLevel, number> = { critical: 0, warning: 1, info: 2 };
        return levelOrder[a.level] - levelOrder[b.level];
      });
  },
);

export function addNotification(payload: SystemNotificationPayload): void {
  const notification: SystemNotification = {
    id: crypto.randomUUID(),
    level: payload.level as SystemNotificationLevel,
    title: payload.title,
    message: payload.message,
    expires_at: payload.expires_at ? new Date(payload.expires_at) : null,
    received_at: new Date(),
  };

  update((all) => {
    // Deduplicate by title+message (backend may re-publish on reconnect)
    const isDupe = all.some(
      (n) =>
        n.title === notification.title &&
        n.message === notification.message &&
        (!n.expires_at || n.expires_at > new Date()),
    );
    if (isDupe) return all;
    return [...all, notification];
  });

  // Auto-remove when expired
  if (notification.expires_at) {
    const ms = notification.expires_at.getTime() - Date.now();
    if (ms > 0) {
      setTimeout(() => dismissNotification(notification.id), ms);
    }
  }
}

export function dismissNotification(id: string): void {
  update((all) => all.filter((n) => n.id !== id));
}

export function clearNotifications(): void {
  set([]);
}
