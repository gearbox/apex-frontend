import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { productProfile } from '$lib/product/profile';
const navigation = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
import RootPage from './+page.svelte';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('redirects to the profile home route', async () => {
  render(RootPage);
  await waitFor(() =>
    expect(navigation.goto).toHaveBeenCalledWith(get(productProfile).homeRoute, {
      replaceState: true,
    }),
  );
});
