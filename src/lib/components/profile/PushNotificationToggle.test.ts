import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';

const { pushSubscription, productInfo } = vi.hoisted(() => ({
  pushSubscription: {
    support: 'supported' as 'supported' | 'needs-install' | 'unsupported',
    permission: 'default' as NotificationPermission,
    subscribed: false,
    loading: false,
    lastResult: null as
      | 'enabled'
      | 'permission-denied'
      | 'permission-dismissed'
      | 'service-worker-unavailable'
      | 'browser-unsubscribe-failed'
      | null,
    enable: vi.fn(),
    disable: vi.fn(),
  },
  productInfo: {
    subscribe(run: (value: { display_name: string }) => void) {
      run({ display_name: 'Vex.pics' });
      return () => {};
    },
  },
}));

vi.mock('$lib/stores/pushSubscription.svelte', () => ({ pushSubscription }));
vi.mock('$lib/stores/product', () => ({ productInfo }));

import PushNotificationToggle from './PushNotificationToggle.svelte';

describe('PushNotificationToggle', () => {
  beforeEach(() => {
    pushSubscription.support = 'supported';
    pushSubscription.permission = 'default';
    pushSubscription.subscribed = false;
    pushSubscription.loading = false;
    pushSubscription.lastResult = null;
  });

  afterEach(() => cleanup());

  it('renders iPhone Settings recovery instructions and disables the toggle when denied', () => {
    pushSubscription.permission = 'denied';

    const { getByRole, getByText } = render(PushNotificationToggle);

    expect(getByText(/Settings → Apps → Vex\.pics → Notifications/)).toBeTruthy();
    expect((getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a retryable hint after a temporary setup failure', () => {
    pushSubscription.lastResult = 'service-worker-unavailable';

    const { getByText } = render(PushNotificationToggle);

    expect(getByText('Notifications are not enabled yet. Please try again.')).toBeTruthy();
  });

  it('disables the toggle while an enable request is in progress', () => {
    pushSubscription.loading = true;

    const { getByRole } = render(PushNotificationToggle);

    expect((getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a retry hint for a failed disable without falsely rendering the toggle off', () => {
    pushSubscription.subscribed = true;
    pushSubscription.lastResult = 'browser-unsubscribe-failed';

    const { getByRole, getByText } = render(PushNotificationToggle);

    expect((getByRole('switch') as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
    expect(getByText('Notifications are not enabled yet. Please try again.')).toBeTruthy();
  });

  it('does not show a stale retry message once the registration is enabled', () => {
    pushSubscription.subscribed = true;
    pushSubscription.lastResult = 'enabled';

    const { queryByText } = render(PushNotificationToggle);

    expect(queryByText('Notifications are not enabled yet. Please try again.')).toBeNull();
  });
});
