import { test, expect } from '../fixtures/auth.fixture';
import { jsonRoute } from '../helpers/api';
import type { Page, Locator } from '@playwright/test';

const syntharaProduct = {
  product: 'synthara',
  display_name: 'Synthara',
  age_gate: 'none',
  allowed_auth_methods: ['email_password'],
  content_rating: 'sfw',
  payment_providers: ['stripe'],
};

async function tabTo(page: Page, target: Locator) {
  for (let index = 0; index < 60; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('The memory action button was not reachable by Tab.');
}

async function keyboardMenuAction(page: Page, title: string, action: 'Archive' | 'Restore') {
  const trigger = page.getByRole('button', { name: 'Actions for ' + title });
  await tabTo(page, trigger);
  await page.keyboard.press('Enter');
  const edit = page.getByRole('menuitem', { name: 'Edit' });
  await expect(edit).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const actionItem = page.getByRole('menuitem', { name: action });
  await expect(actionItem).toBeFocused();
  await page.keyboard.press('Enter');
}

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
        await keyboardMenuAction(page, 'The night the small room sang every word.', 'Archive');
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
        await keyboardMenuAction(page, 'The night the small room sang every word.', 'Restore');
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

  test('keeps right-click as a desktop shortcut', async ({ authenticatedPage: page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chrome',
      'The context-menu shortcut is desktop-only.',
    );
    await page.clock.install();
    await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));
    const artist = {
      id: 'artist-context',
      name: 'Context Artist',
      persona: null,
      voice_notes: null,
      default_language: null,
      aesthetic_references: [],
      style_tags: [],
      global_avoid: [],
      created_at: '2026-11-22T10:00:00Z',
      updated_at: '2026-11-22T10:00:00Z',
    };
    const memory = {
      id: 'memory-context',
      artist_id: artist.id,
      title: 'A right-click memory',
      body: 'The context menu is still available.',
      occurred_on: null,
      themes: [],
      imagery: [],
      salience: 3,
      status: 'active',
      origin: 'user',
      created_at: '2026-11-22T10:00:00Z',
      updated_at: '2026-11-22T10:00:00Z',
    };
    await page.route('**/v1/studio/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'GET' && path === '/v1/studio/artists') {
        return jsonRoute({ items: [artist], limit: 50, has_more: false, next_cursor: null })(route);
      }
      if (route.request().method() === 'GET' && path === '/v1/studio/artists/artist-context') {
        return jsonRoute(artist)(route);
      }
      if (
        route.request().method() === 'GET' &&
        path === '/v1/studio/artists/artist-context/memories'
      ) {
        return jsonRoute({ items: [memory], limit: 30, has_more: false, next_cursor: null })(route);
      }
      return route.continue();
    });

    await page.goto('/app/artists/artist-context');
    const article = page.getByRole('article');
    await expect(article.getByRole('heading', { name: memory.title })).toBeVisible();
    await article.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  });

  test('switching artists does not carry a draft', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'The artist switcher is desktop-only.');
    await page.clock.install();
    await page.route('**/v1/auth/product-info', jsonRoute(syntharaProduct));

    const artists = new Map<string, Record<string, unknown>>();
    const posts: Array<{ artistId: string; body: Record<string, unknown> }> = [];
    let nextArtistId = 1;
    await page.route('**/v1/studio/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
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
        const id = 'artist-switch-' + nextArtistId++;
        const artist = {
          id,
          name: body.name,
          persona: body.persona ?? null,
          voice_notes: null,
          default_language: null,
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
        return jsonRoute(artists.get(artistPath[1]))(route);
      }
      const memoriesPath = path.match(/^\/v1\/studio\/artists\/([^/]+)\/memories$/);
      if (request.method() === 'GET' && memoriesPath) {
        const items = posts
          .filter((post) => post.artistId === memoriesPath[1])
          .map((post, index) => ({
            id: 'memory-switch-' + index,
            artist_id: memoriesPath[1],
            title: post.body.title,
            body: post.body.body,
            occurred_on: post.body.occurred_on ?? null,
            themes: post.body.themes ?? [],
            imagery: post.body.imagery ?? [],
            salience: post.body.salience ?? 3,
            status: 'active',
            origin: 'user',
            created_at: '2026-11-22T10:00:00Z',
            updated_at: '2026-11-22T10:00:00Z',
          }));
        return jsonRoute({ items, limit: 30, has_more: false, next_cursor: null })(route);
      }
      if (request.method() === 'POST' && memoriesPath) {
        const body = request.postDataJSON() as Record<string, unknown>;
        posts.push({ artistId: memoriesPath[1], body });
        return jsonRoute(
          {
            id: 'memory-switch-' + posts.length,
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
          },
          201,
        )(route);
      }
      return route.continue();
    });

    await page.goto('/app/artists');
    await page.getByRole('link', { name: 'Create an artist' }).click();
    await page.getByLabel('Name').fill('Artist One');
    await page.getByRole('button', { name: 'Create and write the first memory' }).click();
    await expect(page).toHaveURL(/\/app\/artists\/artist-switch-1/);

    await page.goto('/app/artists/new');
    await page.getByLabel('Name').fill('Artist Two');
    await page.getByRole('button', { name: 'Create and write the first memory' }).click();
    await expect(page).toHaveURL(/\/app\/artists\/artist-switch-2/);
    const switcher = page.getByRole('navigation', { name: 'Your artists' });
    await switcher.getByRole('link', { name: 'Artist One' }).click();
    const firstComposer = page.getByRole('textbox', { name: 'What happened?' });
    await firstComposer.fill('Draft that belongs only to artist one.');
    await switcher.getByRole('link', { name: 'Artist Two' }).click();

    const secondComposer = page.getByRole('textbox', { name: 'What happened?' });
    await expect(secondComposer).toHaveValue('');
    await secondComposer.fill('A new memory for artist two.');
    await page.getByRole('button', { name: 'Save memory' }).click();
    await expect(page.getByRole('heading', { name: 'A new memory for artist two.' })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].artistId).toBe('artist-switch-2');
    expect(posts[0].body.body).toBe('A new memory for artist two.');
    expect(JSON.stringify(posts)).not.toContain('Draft that belongs only to artist one.');
  });
});
