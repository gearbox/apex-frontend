import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const harness = vi.hoisted(() => ({
  pageUrl:
    'http://localhost/reset-password?token=1f6c9b074e2d8a31c0f5b7e9d246a8c15f3e0b7d9a42c6e18f05b3d7a9c24e61&source=mail&redirect=%2Fapp%2Flibrary',
  events: [] as string[],
  replacedHref: '',
  replaceState: vi.fn(),
  goto: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  goto: harness.goto,
  replaceState: harness.replaceState,
  afterNavigate(callback: () => void) {
    callback();
  },
}));
vi.mock('$app/stores', () => ({
  page: {
    subscribe(run: (value: { url: URL; state: { keep: boolean } }) => void) {
      run({ url: new URL(harness.pageUrl), state: { keep: true } });
      return () => {};
    },
  },
}));
vi.mock('$lib/api/auth', () => ({
  resetPassword: harness.resetPassword,
  AuthError: class AuthError extends Error {
    status = 400;
    error = 'invalid_token';
  },
}));

import Page from './+page.svelte';

const resetToken = '1f6c9b074e2d8a31c0f5b7e9d246a8c15f3e0b7d9a42c6e18f05b3d7a9c24e61';
const consoleOutput: string[] = [];
const consoleMethods = ['debug', 'info', 'log', 'warn', 'error'] as const;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  harness.events.length = 0;
  harness.replacedHref = '';
  harness.pageUrl = `http://localhost/reset-password?token=${resetToken}&source=mail&redirect=%2Fapp%2Flibrary`;
  consoleOutput.length = 0;
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(
        args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
      );
    });
  }
  harness.replaceState.mockImplementation((url: URL) => {
    harness.events.push('replace');
    harness.replacedHref = url.href;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('reset password page URL cleanup', () => {
  it('replaces the URL before a reset request and keeps unrelated query parameters', async () => {
    let finishRequest!: () => void;
    harness.resetPassword.mockImplementation((token: string) => {
      harness.events.push(`request:${token}`);
      return new Promise<void>((resolve) => {
        finishRequest = resolve;
      });
    });

    render(Page);
    await fireEvent.input(screen.getByLabelText('New Password'), {
      target: { value: 'safe-password-123' },
    });
    await fireEvent.input(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'safe-password-123' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(harness.events).toEqual(['replace', `request:${resetToken}`]);
    const sanitized = new URL(harness.replacedHref);
    expect(sanitized.searchParams.has('token')).toBe(false);
    expect(sanitized.searchParams.get('source')).toBe('mail');
    expect(sanitized.searchParams.get('redirect')).toBe('/app/library');
    expect(consoleOutput.join('\n')).not.toContain(resetToken);

    finishRequest();
  });
});
