import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { clearAuth } from '$lib/stores/auth';

const harness = vi.hoisted(() => ({
  pageUrl:
    'http://localhost/verify-email?token=d43a8f19c6e2057b1d9a4f3c8b6e0172a5d9c4f1e8b3076a2c5d9f4e1b8a6037&campaign=spring&source=mail',
  events: [] as string[],
  replacedHref: '',
  replaceState: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
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
  verifyEmail: harness.verifyEmail,
  AuthError: class AuthError extends Error {
    error = 'invalid_token';
  },
}));

import Page from './+page.svelte';

const verificationToken = 'd43a8f19c6e2057b1d9a4f3c8b6e0172a5d9c4f1e8b3076a2c5d9f4e1b8a6037';
const consoleOutput: string[] = [];
const consoleMethods = ['debug', 'info', 'log', 'warn', 'error'] as const;

beforeEach(() => {
  cleanup();
  clearAuth();
  vi.clearAllMocks();
  harness.events.length = 0;
  harness.replacedHref = '';
  harness.pageUrl = `http://localhost/verify-email?token=${verificationToken}&campaign=spring&source=mail`;
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
  harness.verifyEmail.mockImplementation((token: string) => {
    harness.events.push(`request:${token}`);
    return new Promise<void>(() => {});
  });
});

afterEach(() => {
  cleanup();
  clearAuth();
  vi.restoreAllMocks();
});

describe('verify email page URL cleanup', () => {
  it('replaces the URL before verification request processing and preserves other parameters', () => {
    render(Page);

    expect(harness.events).toEqual(['replace', `request:${verificationToken}`]);
    const sanitized = new URL(harness.replacedHref);
    expect(sanitized.searchParams.has('token')).toBe(false);
    expect(sanitized.searchParams.get('campaign')).toBe('spring');
    expect(sanitized.searchParams.get('source')).toBe('mail');
    expect(consoleOutput.join('\n')).not.toContain(verificationToken);
  });
});
