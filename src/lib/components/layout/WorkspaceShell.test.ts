import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { get, type Writable } from 'svelte/store';
import { QueryClient } from '@tanstack/svelte-query';
import type { Component } from 'svelte';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { sidebarCollapsed } from '$lib/stores/ui';
import { STORAGE_KEYS } from '$lib/utils/constants';
vi.mock('$lib/utils/breakpoints', async () => {
  const { writable } = await import('svelte/store');
  return { isDesktop: writable(false) };
});
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ url: new URL('http://localhost/app/studio/p') });
      return () => {};
    },
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
import { isDesktop } from '$lib/utils/breakpoints';
import Harness from './WorkspaceShellHarness.svelte';
const desktop = isDesktop as Writable<boolean>;
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sidebarCollapsed.set(false);
  localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, 'false');
});
afterEach(() => {
  cleanup();
  client.clear();
  desktop.set(false);
  localStorage.removeItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
});
function show() {
  return render(QueryHarness, {
    props: { component: Harness as Component<object>, componentProps: {}, client },
  });
}
it('forces the desktop sidebar collapsed without changing the preference', () => {
  desktop.set(true);
  const { container } = show();
  expect(container.querySelector('.sidebar')?.classList.contains('collapsed')).toBe(true);
  expect(screen.queryByRole('button', { name: /collapse sidebar/i })).toBeNull();
  expect(get(sidebarCollapsed)).toBe(false);
  expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED)).toBe('false');
});
it('has no bottom tabs on mobile', () => {
  desktop.set(false);
  const { container } = show();
  expect(screen.getByText('Workspace content')).toBeTruthy();
  expect(container.querySelector('.btm-tabs')).toBeNull();
});
