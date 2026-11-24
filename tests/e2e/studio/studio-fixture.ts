import type { Page } from '@playwright/test';
import { jsonRoute } from '../helpers/api';
const product = {
  product: 'synthara',
  display_name: 'Synthara',
  age_gate: 'none',
  allowed_auth_methods: ['email_password'],
  content_rating: 'sfw',
  payment_providers: ['stripe'],
};
export async function stubStudio(page: Page, available = true) {
  await page.route('**/v1/auth/product-info', jsonRoute(product));
  let project: {
    library_project_id: string;
    name: string;
    release_kind: string;
    artist_id: string | null;
    concept: string | null;
    track_count: number;
    created_at: string;
    updated_at: string;
  } | null = null;
  let name = '';
  let tracks: Array<{
    id: string;
    library_project_id: string;
    title: string;
    position: number;
    current_plan_version_id: string | null;
    current_lyrics_version_id: string | null;
    created_at: string;
    updated_at: string;
  }> = [];
  const now = new Date().toISOString();
  await page.route('**/v1/library/projects', async (route) => {
    if (route.request().method() === 'POST') {
      name = route.request().postDataJSON().name;
      return jsonRoute({ id: 'p1', name, created_at: now, updated_at: now }, 201)(route);
    }
    return jsonRoute({ items: [], limit: 50, has_more: false, next_cursor: null })(route);
  });
  await page.route('**/v1/studio/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/v1/studio/artists')
      return available
        ? jsonRoute({ items: [], limit: 50, has_more: false, next_cursor: null })(route)
        : jsonRoute({ error: 'not_found', message: 'disabled', status_code: 404 }, 404)(route);
    if (path === '/v1/studio/projects')
      return jsonRoute({
        items: project ? [project] : [],
        limit: 30,
        has_more: false,
        next_cursor: null,
      })(route);
    if (path === '/v1/studio/projects/p1' && method === 'PUT') {
      project = {
        library_project_id: 'p1',
        name,
        ...route.request().postDataJSON(),
        track_count: 0,
        created_at: now,
        updated_at: now,
      };
      return jsonRoute(project)(route);
    }
    if (path === '/v1/studio/projects/p1' && method === 'GET') return jsonRoute(project)(route);
    if (path === '/v1/studio/projects/p1/tracks' && method === 'GET')
      return jsonRoute(tracks)(route);
    if (path === '/v1/studio/projects/p1/tracks' && method === 'POST') {
      const track = {
        id: `t${tracks.length + 1}`,
        library_project_id: 'p1',
        title: route.request().postDataJSON().title,
        position: tracks.length,
        current_plan_version_id: null,
        current_lyrics_version_id: null,
        created_at: now,
        updated_at: now,
      };
      tracks.push(track);
      if (project) project.track_count = tracks.length;
      return jsonRoute(track, 201)(route);
    }
    if (path === '/v1/studio/projects/p1/tracks/order' && method === 'PUT') {
      const ids: string[] = route.request().postDataJSON().track_ids;
      tracks = ids.map((id, position) => ({ ...tracks.find((item) => item.id === id)!, position }));
      return jsonRoute(tracks)(route);
    }
    if (/^\/v1\/studio\/tracks\/t\d+$/.test(path)) {
      const id = path.split('/').at(-1);
      const track = tracks.find((item) => item.id === id);
      return jsonRoute({
        ...track,
        current_plan: {
          content: {
            title: 'Song',
            instrumental: false,
            references: [],
            sections: [{ id: 'verse', kind: 'verse', label: 'Verse' }],
            global_style: { tags: ['dream pop'], avoid: [] },
          },
        },
        current_lyrics: {
          content: {
            language: 'en',
            sections: [{ section_id: 'verse', lines: [{ text: 'A line of lyrics' }] }],
          },
        },
      })(route);
    }
    return route.continue();
  });
}
