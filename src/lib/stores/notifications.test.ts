import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  notifications,
  activeNotifications,
  addNotification,
  dismissNotification,
  clearNotifications,
} from './notifications';
import type { SystemNotificationPayload } from '$lib/api/events';

function makePayload(
  overrides: Partial<SystemNotificationPayload> = {},
): SystemNotificationPayload {
  return {
    level: 'info',
    title: 'Test Title',
    message: 'Test message',
    expires_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  clearNotifications();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('addNotification()', () => {
  it('adds a notification to the store', () => {
    addNotification(makePayload());
    expect(get(notifications)).toHaveLength(1);
    expect(get(notifications)[0].title).toBe('Test Title');
    expect(get(notifications)[0].message).toBe('Test message');
    expect(get(notifications)[0].level).toBe('info');
  });

  it('assigns a unique id and received_at', () => {
    addNotification(makePayload());
    const n = get(notifications)[0];
    expect(n.id).toBeTruthy();
    expect(n.received_at).toBeInstanceOf(Date);
  });

  it('deduplicates by title+message', () => {
    addNotification(makePayload({ title: 'Same', message: 'Same message' }));
    addNotification(makePayload({ title: 'Same', message: 'Same message' }));
    expect(get(notifications)).toHaveLength(1);
  });

  it('allows different title or message', () => {
    addNotification(makePayload({ title: 'A', message: 'msg' }));
    addNotification(makePayload({ title: 'B', message: 'msg' }));
    expect(get(notifications)).toHaveLength(2);
  });

  it('sets expires_at when provided', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    addNotification(makePayload({ expires_at: future }));
    const n = get(notifications)[0];
    expect(n.expires_at).toBeInstanceOf(Date);
  });

  it('auto-removes notification after expires_at', () => {
    const future = new Date(Date.now() + 1000).toISOString();
    addNotification(makePayload({ expires_at: future }));
    expect(get(notifications)).toHaveLength(1);

    vi.advanceTimersByTime(1001);
    expect(get(notifications)).toHaveLength(0);
  });
});

describe('dismissNotification()', () => {
  it('removes notification by id', () => {
    addNotification(makePayload());
    const { id } = get(notifications)[0];

    dismissNotification(id);
    expect(get(notifications)).toHaveLength(0);
  });

  it('does nothing for unknown id', () => {
    addNotification(makePayload());
    dismissNotification('unknown-id');
    expect(get(notifications)).toHaveLength(1);
  });
});

describe('clearNotifications()', () => {
  it('removes all notifications', () => {
    addNotification(makePayload({ title: 'A' }));
    addNotification(makePayload({ title: 'B' }));
    clearNotifications();
    expect(get(notifications)).toHaveLength(0);
  });
});

describe('activeNotifications', () => {
  it('filters out expired notifications', () => {
    // Add expired notification
    const past = new Date(Date.now() - 1000).toISOString();
    addNotification(makePayload({ title: 'Expired', expires_at: past }));
    // Add non-expired notification
    addNotification(makePayload({ title: 'Active' }));

    const active = get(activeNotifications);
    expect(active.some((n) => n.title === 'Expired')).toBe(false);
    expect(active.some((n) => n.title === 'Active')).toBe(true);
  });

  it('sorts by level priority: critical > warning > info', () => {
    addNotification(makePayload({ level: 'info', title: 'Info' }));
    addNotification(makePayload({ level: 'critical', title: 'Critical' }));
    addNotification(makePayload({ level: 'warning', title: 'Warning' }));

    const active = get(activeNotifications);
    expect(active[0].level).toBe('critical');
    expect(active[1].level).toBe('warning');
    expect(active[2].level).toBe('info');
  });
});
