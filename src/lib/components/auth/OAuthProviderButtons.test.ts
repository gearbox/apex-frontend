import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { vexGoogleProductHandler } from '../../../mocks/handlers/auth';
import { productInfo, type ProductInfo } from '$lib/stores/product';

const { startOAuthSignIn } = vi.hoisted(() => ({ startOAuthSignIn: vi.fn() }));
vi.mock('$lib/api/oauth', () => ({ startOAuthSignIn }));

import OAuthProviderButtons from './OAuthProviderButtons.svelte';

const emailOnly: ProductInfo = {
  product: 'vex',
  display_name: 'Vex.pics',
  age_gate: 'none',
  allowed_auth_methods: ['email_password'],
  content_rating: 'permissive',
  payment_providers: [],
};

beforeEach(() => {
  productInfo.set(null);
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  productInfo.set(null);
});

describe('OAuthProviderButtons', () => {
  it('S3: serves the standalone Google_G_logo.svg mark without a white button container', () => {
    const svg = readFileSync(resolve(process.cwd(), 'static/google-g.svg'), 'utf8');

    expect(svg).not.toMatch(/<(?:path|rect)\b[^>]*\bfill=["']white["']/i);
  });

  it('R1-i: stays hidden until product info enables Google sign-in', async () => {
    render(OAuthProviderButtons, { props: { returnTo: null } });
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
    cleanup();

    productInfo.set(emailOnly);
    render(OAuthProviderButtons, { props: { returnTo: null } });
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
    cleanup();

    server.use(vexGoogleProductHandler);
    const response = await fetch(`${BASE}/v1/auth/product-info`);
    productInfo.set((await response.json()) as ProductInfo);
    render(OAuthProviderButtons, { props: { returnTo: '/app/gallery' } });

    const button = screen.getByRole('button', { name: /continue with google/i });
    expect(button.querySelector('img')?.getAttribute('src')).toBe('/google-g.svg');
    await fireEvent.click(button);
    await fireEvent.click(button);
    expect(startOAuthSignIn).toHaveBeenCalledOnce();
    expect(startOAuthSignIn).toHaveBeenCalledWith('google', '/app/gallery');
  });

  it('R1-i: drops unsafe return targets before sign-in begins', async () => {
    productInfo.set({ ...emailOnly, allowed_auth_methods: ['google_oauth'] });
    render(OAuthProviderButtons, { props: { returnTo: '//evil.example' } });

    await fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(startOAuthSignIn).toHaveBeenCalledWith('google', null);
  });
});
