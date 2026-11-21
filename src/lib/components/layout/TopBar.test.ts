import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { productProfile } from '$lib/product/profile';
const state = vi.hoisted(() => ({ path: '/app/create' }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: new URL(`http://localhost${state.path}`) });
      return () => {};
    },
  },
}));
import TopBar from './TopBar.svelte';
let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
});
describe('TopBar', () => {
  it.each([
    ['/app/admin', 'Admin Panel'],
    ['/app/jobs', 'Jobs'],
    ['/app/jobs/123', ''],
  ])('uses an exact title for %s', (path, title) => {
    state.path = path;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(QueryHarness<ComponentProps<typeof TopBar>>, {
      client,
      component: TopBar,
      componentProps: {},
    });
    expect(container.querySelector('.topbar-title')?.textContent ?? '').toBe(title);
    expect(container.querySelector('.topbar-logo')?.getAttribute('href')).toBe(
      get(productProfile).homeRoute,
    );
  });
});
