import type { ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { makeUserProfile } from '../../../mocks/factories/user';
import { clearAuth, setUser } from '$lib/stores/auth';
import { productInfo } from '$lib/stores/product';
import { sidebarCollapsed } from '$lib/stores/ui';

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: new URL('http://localhost/app/create') });
      return () => {};
    },
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
import DesktopSidebar from './DesktopSidebar.svelte';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sidebarCollapsed.set(false);
});
afterEach(() => {
  cleanup();
  client.clear();
  clearAuth();
  productInfo.set(null);
});
describe('DesktopSidebar', () => {
  it.each(['vex', 'synthara'])(
    'preserves navigation order and project placement for %s',
    (product) => {
      productInfo.set({
        product,
        display_name: product,
        age_gate: 'none',
        allowed_auth_methods: ['email_password'],
        content_rating: 'sfw',
        payment_providers: ['stripe'],
      });
      const { container } = render(QueryHarness<ComponentProps<typeof DesktopSidebar>>, {
        client,
        component: DesktopSidebar,
        componentProps: {},
      });
      const links = Array.from(container.querySelectorAll('.sidebar-nav > a')).map((node) =>
        node.textContent?.trim(),
      );
      expect(links).toEqual(['Create', 'Library', 'Sessions', 'Jobs', 'Billing']);
      expect(
        screen
          .getByRole('link', { name: 'Library' })
          .nextElementSibling?.classList.contains('desktop-project-nav'),
      ).toBe(true);
      expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    },
  );
  it('shows the admin entry for admins', () => {
    setUser(makeUserProfile({ role: 'admin' }));
    render(QueryHarness<ComponentProps<typeof DesktopSidebar>>, {
      client,
      component: DesktopSidebar,
      componentProps: {},
    });
    expect(screen.getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/app/admin');
  });
});
