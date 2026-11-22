import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { closeMobileNavSheet, openMoreSheet, sidebarCollapsed } from '$lib/stores/ui';

const navigation = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: new URL('http://localhost/app/create') });
      return () => {};
    },
  },
}));
vi.mock('$lib/product/profile', async () => {
  const { divergentProfileStore } = await import('$lib/product/testing/profileFixture');
  return { productProfile: divergentProfileStore };
});
import DesktopSidebar from './DesktopSidebar.svelte';
import MobileBottomTabs from './MobileBottomTabs.svelte';
import MobileMoreSheet from './MobileMoreSheet.svelte';
import TopBar from './TopBar.svelte';
import RootPage from '../../../routes/+page.svelte';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sidebarCollapsed.set(false);
});
afterEach(() => {
  closeMobileNavSheet();
  cleanup();
  client.clear();
  vi.clearAllMocks();
});
describe('surfaces follow an injected profile', () => {
  it('DesktopSidebar follows the injected profile', () => {
    const { container } = render(QueryHarness<ComponentProps<typeof DesktopSidebar>>, {
      client,
      component: DesktopSidebar,
      componentProps: {},
    });
    expect(
      Array.from(container.querySelectorAll('.sidebar-nav > a')).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['Billing', 'Create']);
    expect(container.querySelector('.desktop-project-nav')).toBeNull();
  });
  it('MobileBottomTabs follows the injected profile', () => {
    const { container } = render(MobileBottomTabs);
    expect(
      Array.from(container.querySelectorAll('.btm-tab-label')).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['Jobs', 'More']);
    expect(screen.queryByTestId('mobile-library-slot')).toBeNull();
  });
  it('MobileMoreSheet follows the injected profile', async () => {
    openMoreSheet();
    render(MobileMoreSheet);
    await tick();
    expect(document.querySelector('.sheet-item-label')?.textContent?.trim()).toBe(
      'Profile & Settings',
    );
    expect(screen.queryByRole('link', { name: 'Billing & Tokens' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Job History' })).toBeNull();
  });
  it('TopBar logo follows the injected home route', () => {
    const { container } = render(QueryHarness<ComponentProps<typeof TopBar>>, {
      client,
      component: TopBar,
      componentProps: {},
    });
    expect(container.querySelector('.topbar-logo')?.getAttribute('href')).toBe('/app/library');
  });
  it('root page redirects to the injected home route', async () => {
    render(RootPage);
    await waitFor(() =>
      expect(navigation.goto).toHaveBeenCalledWith('/app/library', { replaceState: true }),
    );
  });
});
