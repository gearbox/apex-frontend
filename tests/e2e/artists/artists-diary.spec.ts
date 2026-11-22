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

test.describe('Artists diary', () => {
  test(
    'creates an artist and memory, then archives and restores the memory',
    { tag: '@cross-browser' },
    async ({ authenticatedPage: page }, testInfo) => {
      test.skip(testInfo.project.name === 'mobile-safari', 'Covered on desktop and mobile Chrome.');
      await page.clock.install();
      await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));

      const artists = new Map<string, Record<string, unknown>>();
      const memories = new Map<string, Record<string, unknown>>();
      let nextArtistId = 1;
      let nextMemoryId = 1;
      await page.route('**/v1/studio/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        if (request.method() === 'GET' && path === '/v1/studio/artists') {
          return jsonRoute({
            items: [...artists.values()],
            limit: 50,
            has_more: false,
            next_cursor: null,
          })(route);
        }
        if (request.method() === 'POST' && path === '/v1/studio/artists') {
          const body = request.postDataJSON() as Record<string, unknown>;
          const id = `artist-e2e-${nextArtistId++}`;
          const artist = {
            id,
            name: body.name,
            persona: body.persona ?? null,
            voice_notes: null,
            default_language: body.default_language ?? null,
            aesthetic_references: [],
            style_tags: [],
            global_avoid: [],
            created_at: '2026-11-22T10:00:00Z',
            updated_at: '2026-11-22T10:00:00Z',
          };
          artists.set(id, artist);
          return jsonRoute(artist, 201)(route);
        }
        const artistPath = path.match(/^\/v1\/studio\/artists\/([^/]+)$/);
        if (request.method() === 'GET' && artistPath) {
          const artist = artists.get(artistPath[1]);
          return artist
            ? jsonRoute(artist)(route)
            : jsonRoute(
                { error: 'artist_not_found', message: 'Missing', status_code: 404 },
                404,
              )(route);
        }
        const memoriesPath = path.match(/^\/v1\/studio\/artists\/([^/]+)\/memories$/);
        if (request.method() === 'GET' && memoriesPath) {
          const status = url.searchParams.get('status') ?? 'active';
          const items = [...memories.values()].filter(
            (memory) => memory.artist_id === memoriesPath[1] && memory.status === status,
          );
          return jsonRoute({ items, limit: 30, has_more: false, next_cursor: null })(route);
        }
        if (request.method() === 'POST' && memoriesPath) {
          const body = request.postDataJSON() as Record<string, unknown>;
          const id = `memory-e2e-${nextMemoryId++}`;
          const memory = {
            id,
            artist_id: memoriesPath[1],
            title: body.title,
            body: body.body,
            occurred_on: body.occurred_on ?? null,
            themes: body.themes ?? [],
            imagery: body.imagery ?? [],
            salience: body.salience ?? 3,
            status: 'active',
            origin: 'user',
            created_at: '2026-11-22T10:00:00Z',
            updated_at: '2026-11-22T10:00:00Z',
          };
          memories.set(id, memory);
          return jsonRoute(memory, 201)(route);
        }
        const memoryPath = path.match(/^\/v1\/studio\/memories\/([^/]+)$/);
        if (memoryPath && request.method() === 'PATCH') {
          const memory = memories.get(memoryPath[1]);
          if (!memory)
            return jsonRoute(
              { error: 'memory_not_found', message: 'Missing', status_code: 404 },
              404,
            )(route);
          Object.assign(memory, request.postDataJSON() as Record<string, unknown>);
          return jsonRoute(memory)(route);
        }
        if (memoryPath && request.method() === 'DELETE') {
          memories.delete(memoryPath[1]);
          return route.fulfill({ status: 204, body: '' });
        }
        return route.continue();
      });

      await page.goto('/app/artists');
      await expect(page.getByRole('heading', { name: "Who's your first artist?" })).toBeVisible();
      await page.getByRole('link', { name: 'Create an artist' }).click();
      await page.getByRole('radio', { name: 'Human' }).click();
      await page.getByLabel('Name').fill('Iris Vale');
      await page.getByRole('button', { name: 'Create and write the first memory' }).click();
      await expect(page).toHaveURL(/\/app\/artists\/artist-e2e-1(?:\?compose=1)?$/);

      if (testInfo.project.name === 'mobile-chrome') {
        await expect(page.getByRole('dialog', { name: 'Quick capture' })).toBeVisible();
      }
      const body = page.getByRole('textbox', { name: 'What happened?' });
      await expect(body).toBeVisible();
      await body.fill('The night the small room sang every word.\nRain on the walk home.');
      await page.getByRole('button', { name: 'Save memory' }).click();
      await expect(
        page.getByRole('heading', { name: 'The night the small room sang every word.' }),
      ).toBeVisible();

      if (testInfo.project.name === 'mobile-chrome') {
        await page
          .getByRole('button', { name: 'Actions for The night the small room sang every word.' })
          .click();
        await page.getByRole('menuitem', { name: 'Archive' }).click();
      } else {
        await page.getByRole('article').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Archive' }).click();
      }
      await expect(
        page.getByRole('heading', { name: 'The night the small room sang every word.' }),
      ).toHaveCount(0);

      await page.getByRole('tab', { name: 'Archived' }).click();
      await expect(
        page.getByRole('heading', { name: 'The night the small room sang every word.' }),
      ).toBeVisible();
      if (testInfo.project.name === 'mobile-chrome') {
        await page
          .getByRole('button', { name: 'Actions for The night the small room sang every word.' })
          .click();
        await page.getByRole('menuitem', { name: 'Restore' }).click();
      } else {
        await page.getByRole('article').click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Restore' }).click();
      }
      await expect(
        page.getByRole('heading', { name: 'The night the small room sang every word.' }),
      ).toHaveCount(0);
      await page.getByRole('tab', { name: 'Active' }).click();
      await expect(
        page.getByRole('heading', { name: 'The night the small room sang every word.' }),
      ).toBeVisible();
    },
  );
});
