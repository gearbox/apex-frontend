import { expect, vi } from 'vitest';
import { cleanup } from '@testing-library/svelte';

const recoveryHarness = vi.hoisted(() => ({
  pageUrl: 'http://localhost/recovery',
  events: [] as string[],
  replacedHref: '',
  replaceState: vi.fn(),
  goto: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
}));

export function getRecoveryHarness() {
  return recoveryHarness;
}

vi.mock('$app/navigation', () => ({
  goto: recoveryHarness.goto,
  replaceState: recoveryHarness.replaceState,
  afterNavigate(callback: () => void) {
    callback();
  },
}));
vi.mock('$app/stores', () => ({
  page: {
    subscribe(run: (value: { url: URL; state: { keep: boolean } }) => void) {
      run({ url: new URL(recoveryHarness.pageUrl), state: { keep: true } });
      return () => {};
    },
  },
}));
vi.mock('$lib/api/auth', () => ({
  resetPassword: recoveryHarness.resetPassword,
  verifyEmail: recoveryHarness.verifyEmail,
  AuthError: class AuthError extends Error {
    status = 400;
    error = 'invalid_token';
  },
}));

const consoleMethods = ['debug', 'info', 'log', 'warn', 'error'] as const;
const consoleOutput: string[] = [];

export function setupRecoveryUrlTest(pageUrl: string): void {
  cleanup();
  vi.clearAllMocks();
  recoveryHarness.events.length = 0;
  recoveryHarness.replacedHref = '';
  recoveryHarness.pageUrl = pageUrl;
  consoleOutput.length = 0;
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleOutput.push(
        args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
      );
    });
  }
  recoveryHarness.replaceState.mockImplementation((url: URL) => {
    recoveryHarness.events.push('replace');
    recoveryHarness.replacedHref = url.href;
  });
}

export function cleanupRecoveryUrlTest(): void {
  cleanup();
  vi.restoreAllMocks();
}

export function expectRecoveryTokenSanitized(
  token: string,
  preservedParams: Record<string, string>,
): void {
  expect(recoveryHarness.events).toEqual(['replace', `request:${token}`]);
  const sanitized = new URL(recoveryHarness.replacedHref);
  expect(sanitized.searchParams.has('token')).toBe(false);
  for (const [name, value] of Object.entries(preservedParams)) {
    expect(sanitized.searchParams.get(name)).toBe(value);
  }
  expect(consoleOutput.join('\n')).not.toContain(token);
}
