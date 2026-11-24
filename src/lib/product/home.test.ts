import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuthStatus } from '$lib/stores/auth';
import { productInfo } from '$lib/stores/product';
import { homeFor, resolveHomeRoute } from './home';
import type { ProductHome } from './profiles';
const home: ProductHome = {
  route: '/app/create',
  whenCapable: { capability: 'studio', route: '/app/studio' },
};
afterEach(() => {
  productInfo.set(null);
  setAuthStatus('unknown');
});
describe('capability-aware home', () => {
  it.each(['unknown', 'unavailable', 'unreachable'] as const)('falls back for %s', (state) => {
    expect(homeFor(home, state)).toBe('/app/create');
  });
  it('uses Studio when available', () => {
    expect(homeFor(home, 'available')).toBe('/app/studio');
  });
  it('never probes anonymously', async () => {
    const settle = vi.fn();
    setAuthStatus('unauthenticated');
    expect(await resolveHomeRoute({ settle })).toBe('/app/create');
    expect(settle).not.toHaveBeenCalled();
  });
  it.each(['available', 'unavailable', 'unreachable', 'unknown'] as const)(
    'resolves %s',
    async (state) => {
      productInfo.set({
        product: 'synthara',
        display_name: 'Synthara',
        age_gate: 'none',
        allowed_auth_methods: ['email_password'],
        content_rating: 'sfw',
        payment_providers: ['stripe'],
      });
      setAuthStatus('authenticated');
      const settle = vi.fn().mockResolvedValue(state);
      expect(await resolveHomeRoute({ settle })).toBe(
        state === 'available' ? '/app/studio' : '/app/create',
      );
      expect(settle).toHaveBeenCalledOnce();
    },
  );
  it('never probes for Vex', async () => {
    productInfo.set({
      product: 'vex',
      display_name: 'Vex',
      age_gate: 'none',
      allowed_auth_methods: ['email_password'],
      content_rating: 'sfw',
      payment_providers: ['stripe'],
    });
    setAuthStatus('authenticated');
    const settle = vi.fn();
    expect(await resolveHomeRoute({ settle })).toBe('/app/create');
    expect(settle).not.toHaveBeenCalled();
  });
});
