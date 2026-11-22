import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';

const syntharaProduct = {
  product: 'synthara',
  display_name: 'Synthara',
  age_gate: 'none',
  allowed_auth_methods: ['email_password'],
  content_rating: 'sfw',
  payment_providers: ['stripe'],
};
const artist = {
  id: 'artist-a11y',
  name: 'Mira Vale',
  persona: 'A songwriter with a life in the rain.',
  voice_notes: null,
  default_language: 'en',
  aesthetic_references: [],
  style_tags: ['dream pop'],
  global_avoid: [],
  created_at: '2026-11-22T10:00:00Z',
  updated_at: '2026-11-22T10:00:00Z',
};

async function expectNoSeriousAxeViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test.describe('Artists accessibility', () => {
  test('supports chip keyboard navigation, selected tabs, and passes axe on all four screens', async ({
    authenticatedPage: page,
  }) => {
    await page.clock.install();
    await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));
    await page.route('**/v1/studio/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === '/v1/studio/artists' && route.request().method() === 'GET') {
        return jsonRoute({ items: [artist], limit: 50, has_more: false, next_cursor: null })(route);
      }
      if (path === '/v1/studio/artists/artist-a11y' && route.request().method() === 'GET') {
        return jsonRoute(artist)(route);
      }
      if (
        path === '/v1/studio/artists/artist-a11y/memories' &&
        route.request().method() === 'GET'
      ) {
        return jsonRoute({ items: [], limit: 30, has_more: false, next_cursor: null })(route);
      }
      return route.continue();
    });

    await page.goto('/app/artists');
    await expect(page.getByRole('heading', { name: 'Artists', exact: true })).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    await page.goto('/app/artists/new');
    await expect(page.getByRole('heading', { name: 'Who is this artist?' })).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    const human = page.getByRole('radio', { name: 'Human' });
    await human.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Creature' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.goto('/app/artists/artist-a11y');
    await expect(page.getByRole('link', { name: 'Diary' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('tab', { name: 'Active' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expectNoSeriousAxeViolations(page);
    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(page.getByRole('tab', { name: 'Archived' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.goto('/app/artists/artist-a11y/profile');
    await expect(
      page.getByRole('navigation', { name: 'Artist sections' }).getByRole('link', {
        name: 'Profile',
      }),
    ).toHaveAttribute('aria-current', 'page');
    await expectNoSeriousAxeViolations(page);
  });
});
