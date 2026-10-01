import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ProductInfo } from '$lib/stores/product';

const testState = vi.hoisted(() => ({
  pageUrl: 'http://localhost/login',
  goto: vi.fn(),
  replaceState: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  goto: testState.goto,
  replaceState: testState.replaceState,
  afterNavigate(callback: () => void) {
    callback();
  },
}));
vi.mock('$app/stores', () => ({
  page: {
    subscribe(run: (value: { url: URL }) => void) {
      run({ url: new URL(testState.pageUrl) });
      return () => {};
    },
  },
}));

import { productInfo } from '$lib/stores/product';
import { clearAuth, setAuthFailureReason } from '$lib/stores/auth';
import Page from './+page.svelte';

const googleOnly: ProductInfo = {
  product: 'vex',
  display_name: 'Vex.pics',
  age_gate: 'none',
  allowed_auth_methods: ['google_oauth'],
  content_rating: 'permissive',
  payment_providers: [],
};

beforeEach(() => {
  clearAuth();
  productInfo.set(null);
  sessionStorage.clear();
  testState.pageUrl = 'http://localhost/login';
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  productInfo.set(null);
});

describe('login page', () => {
  it('R1-k: ignores an unsafe redirect after a password login', async () => {
    testState.pageUrl = 'http://localhost/login?redirect=%2F%2Fevil.example';
    render(Page);

    await fireEvent.input(screen.getByLabelText('Email address'), {
      target: { value: 'login@example.com' },
    });
    await fireEvent.input(screen.getByLabelText('Password'), {
      target: { value: 'valid-password' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(testState.goto).toHaveBeenCalledWith('/app/create', { replaceState: true }),
    );
  });

  it('R3: keeps the token-reuse explanation visible on a Google-only product', async () => {
    productInfo.set(googleOnly);
    setAuthFailureReason('token_reuse_detected');

    render(Page);

    await waitFor(() => expect(screen.getByText('Security notice')).toBeTruthy());
    expect(screen.getByText(/refresh token was reused/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeTruthy();
    expect(screen.queryByLabelText('Email address')).toBeNull();
  });

  it('removes the reset flag immediately and preserves unrelated query parameters', async () => {
    testState.pageUrl = 'http://localhost/login?reset=done&source=invite&redirect=%2Fapp%2Flibrary';

    setAuthFailureReason('token_reuse_detected');
    render(Page);

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.queryByText('Security notice')).toBeNull();
    expect(testState.replaceState).toHaveBeenCalledTimes(1);
    const sanitized = new URL(testState.replaceState.mock.calls[0][0] as URL);
    expect(sanitized.searchParams.has('reset')).toBe(false);
    expect(sanitized.searchParams.get('source')).toBe('invite');
    expect(sanitized.searchParams.get('redirect')).toBe('/app/library');
  });
});
