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
export async function stubStudio(page: Page, available = true, emptyTrackDocuments = false) {
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
    current_audio_version_id: string | null;
    created_at: string;
    updated_at: string;
  }> = [];
  type PlanSection = {
    id: string;
    kind: string;
    label: string | null;
    delivery: string[];
    instrumental: boolean;
  };
  type Plan = {
    title: string;
    instrumental: boolean;
    references: string[];
    global_style: { tags: string[]; avoid: string[] };
    sections: PlanSection[];
  };
  type Lyrics = {
    language: string;
    sections: Array<{ section_id: string; lines: Array<{ text: string; delivery: string[] }> }>;
  };
  type Version = {
    id: string;
    track_id: string;
    version_number: number;
    parent_version_id: string | null;
    based_on_plan_version_id?: string;
    origin: 'user' | 'import';
    schema_version: number;
    content_hash: string;
    created_at: string;
    is_current: boolean;
    kind: 'plan' | 'lyrics';
    content: Plan | Lyrics;
  };
  const versions: Version[] = [];
  let importCount = 0;
  const currentRequests: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  await page.route(/\/v1\/library\/projects(?:\?.*)?$/, async (route) => {
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
        current_audio_version_id: null,
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
    const importTrackPath = path.match(/^\/v1\/studio\/tracks\/(t\d+)\/imports\/suno$/);
    if (importTrackPath && method === 'POST') {
      const track = tracks.find((item) => item.id === importTrackPath[1]);
      if (!track)
        return jsonRoute(
          { error: 'not_found', message: 'Track not found', status_code: 404 },
          404,
        )(route);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const text = String(body.lyrics ?? '').replace(/\r\n?/g, '\n');
      const sections: PlanSection[] = [];
      const lyricSections: Lyrics['sections'] = [];
      let active: PlanSection | undefined;
      let activeLines: Lyrics['sections'][number]['lines'] = [];
      const flush = () => {
        if (!active) return;
        sections.push(active);
        if (activeLines.length) lyricSections.push({ section_id: active.id, lines: activeLines });
        active = undefined;
        activeLines = [];
      };
      for (const line of text.split('\n')) {
        const header = /^\[([^\]]+)\]$/.exec(line.trim());
        if (header) {
          flush();
          const name = header[1];
          const kind = name
            .toLowerCase()
            .replace(/\s+\d+$/, '')
            .replace(/-/g, '_');
          active = {
            id: `section-${importCount + 1}-${sections.length + 1}`,
            kind: [
              'intro',
              'verse',
              'pre_chorus',
              'chorus',
              'post_chorus',
              'hook',
              'bridge',
              'build',
              'drop',
              'breakdown',
              'instrumental',
              'interlude',
              'outro',
            ].includes(kind)
              ? kind
              : 'interlude',
            label: name,
            delivery: [],
            instrumental: false,
          };
        } else if (line.trim()) {
          if (!active)
            active = {
              id: `section-${importCount + 1}-${sections.length + 1}`,
              kind: 'verse',
              label: null,
              delivery: [],
              instrumental: false,
            };
          activeLines.push({ text: line.trim(), delivery: [] });
        }
      }
      flush();
      const tags = String(body.style ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const avoid = String(body.exclude ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const plan: Plan = {
        title: typeof body.title === 'string' ? body.title : track.title,
        instrumental: body.instrumental === true,
        references: [],
        global_style: { tags, avoid },
        sections,
      };
      const lyrics: Lyrics | null = lyricSections.length
        ? { language: String(body.language ?? 'en'), sections: lyricSections }
        : null;
      if (body.dry_run === true) {
        return jsonRoute({
          dry_run: true,
          plan,
          lyrics,
          plan_unchanged: false,
          lyrics_unchanged: false,
          warnings: [],
          round_trip: { style: true, exclude: true, lyrics: true },
          plan_version: null,
          lyrics_version: null,
          created: false,
        })(route);
      }
      importCount++;
      const planVersionId = `plan-v${importCount}`;
      const planVersion: Version = {
        id: planVersionId,
        track_id: track.id,
        version_number: importCount,
        parent_version_id: track.current_plan_version_id,
        origin: 'import',
        schema_version: 2,
        content_hash: `plan-hash-${importCount}`,
        created_at: now,
        is_current: true,
        kind: 'plan',
        content: plan,
      };
      versions.forEach((version) => {
        if (version.track_id === track.id && version.kind === 'plan') version.is_current = false;
      });
      versions.push(planVersion);
      const lyricsVersion: Version | null = lyrics
        ? {
            id: `lyrics-v${importCount}`,
            track_id: track.id,
            version_number: importCount,
            parent_version_id: track.current_lyrics_version_id,
            based_on_plan_version_id: planVersion.id,
            origin: 'import',
            schema_version: 1,
            content_hash: `lyrics-hash-${importCount}`,
            created_at: now,
            is_current: true,
            kind: 'lyrics',
            content: lyrics,
          }
        : null;
      versions.forEach((version) => {
        if (version.track_id === track.id && version.kind === 'lyrics') version.is_current = false;
      });
      if (lyricsVersion) versions.push(lyricsVersion);
      track.current_plan_version_id = planVersion.id;
      track.current_lyrics_version_id = lyricsVersion?.id ?? null;
      const summary = (version: Version | null) =>
        version && {
          id: version.id,
          kind: version.kind,
          version_number: version.version_number,
          parent_version_id: version.parent_version_id,
          based_on_plan_version_id: version.based_on_plan_version_id ?? null,
          origin: version.origin,
          schema_version: version.schema_version,
          content_hash: version.content_hash,
          created_at: version.created_at,
          is_current: version.is_current,
        };
      return jsonRoute(
        {
          dry_run: false,
          plan,
          lyrics,
          plan_unchanged: false,
          lyrics_unchanged: false,
          warnings: [],
          round_trip: { style: true, exclude: true, lyrics: true },
          plan_version: summary(planVersion),
          lyrics_version: summary(lyricsVersion),
          created: true,
        },
        201,
      )(route);
    }
    const versionsPath = path.match(/^\/v1\/studio\/tracks\/(t\d+)\/versions$/);
    if (versionsPath && method === 'POST') {
      const track = tracks.find((item) => item.id === versionsPath[1]);
      if (!track)
        return jsonRoute(
          { error: 'not_found', message: 'Track not found', status_code: 404 },
          404,
        )(route);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const kind = body.kind as 'plan' | 'lyrics';
      const parentId = (body.parent_version_id as string | null | undefined) ?? null;
      const content = body.content as Plan | Lyrics;
      const basedOn = kind === 'lyrics' ? String(body.based_on_plan_version_id) : undefined;
      const parent = versions.find(
        (version) =>
          version.id === parentId && version.track_id === track.id && version.kind === kind,
      );
      if (parentId && !parent)
        return jsonRoute(
          { error: 'parent_version_not_found', message: 'Parent not found', status_code: 404 },
          404,
        )(route);
      if (
        kind === 'lyrics' &&
        !versions.some(
          (version) =>
            version.id === basedOn && version.track_id === track.id && version.kind === 'plan',
        )
      )
        return jsonRoute(
          { error: 'plan_version_not_found', message: 'Plan not found', status_code: 404 },
          404,
        )(route);
      const replay = versions.find(
        (version) =>
          version.track_id === track.id &&
          version.kind === kind &&
          version.parent_version_id === parentId &&
          (kind === 'lyrics' ? version.based_on_plan_version_id === basedOn : true) &&
          JSON.stringify(version.content) === JSON.stringify(content),
      );
      if (replay) return jsonRoute({ version: replay, lyrics_detached: false })(route);
      if (parent && JSON.stringify(parent.content) === JSON.stringify(content))
        return jsonRoute(
          { error: 'version_unchanged', message: 'Content is unchanged', status_code: 409 },
          409,
        )(route);
      const versionNumber =
        Math.max(
          0,
          ...versions
            .filter((version) => version.track_id === track.id && version.kind === kind)
            .map((version) => version.version_number),
        ) + 1;
      const version: Version = {
        id: `${kind}-${track.id}-v${versionNumber}`,
        track_id: track.id,
        version_number: versionNumber,
        parent_version_id: parentId,
        ...(kind === 'lyrics' ? { based_on_plan_version_id: basedOn } : {}),
        origin: 'user',
        schema_version: kind === 'plan' ? 2 : 1,
        content_hash: `${kind}-hash-${track.id}-${versionNumber}`,
        created_at: new Date().toISOString(),
        is_current: body.make_current !== false,
        kind,
        content,
      };
      if (body.make_current !== false) {
        const planId = kind === 'plan' ? version.id : track.current_plan_version_id;
        const lyricsId = kind === 'lyrics' ? version.id : track.current_lyrics_version_id;
        const plan = (
          kind === 'plan' ? version.content : versions.find((item) => item.id === planId)?.content
        ) as Plan | undefined;
        const lyrics = (
          kind === 'lyrics'
            ? version.content
            : versions.find((item) => item.id === lyricsId)?.content
        ) as Lyrics | undefined;
        const compatible =
          !!plan &&
          (!lyrics ||
            (!plan.instrumental &&
              lyrics.sections.every((section) =>
                plan.sections.some(
                  (item) =>
                    item.id === section.section_id &&
                    !item.instrumental &&
                    item.kind !== 'instrumental',
                ),
              )));
        if (!compatible)
          return jsonRoute(
            {
              error: 'lyrics_incompatible_with_plan',
              message: 'Incompatible lyrics',
              status_code: 409,
            },
            409,
          )(route);
        track.current_plan_version_id = planId;
        track.current_lyrics_version_id = lyricsId;
      }
      versions.push(version);
      return jsonRoute({ version, lyrics_detached: false }, 201)(route);
    }
    if (versionsPath && method === 'GET') {
      const kind = new URL(route.request().url()).searchParams.get('kind');
      const items = versions
        .filter(
          (version) => version.track_id === versionsPath[1] && (!kind || version.kind === kind),
        )
        .sort((left, right) => right.version_number - left.version_number)
        .map((version) => ({
          id: version.id,
          kind: version.kind,
          version_number: version.version_number,
          parent_version_id: version.parent_version_id,
          based_on_plan_version_id: version.based_on_plan_version_id ?? null,
          origin: version.origin,
          schema_version: version.schema_version,
          content_hash: version.content_hash,
          created_at: version.created_at,
          is_current: version.is_current,
        }));
      return jsonRoute({ items, limit: 30, has_more: false, next_cursor: null })(route);
    }
    const versionPath = path.match(/^\/v1\/studio\/versions\/([^/]+)$/);
    if (versionPath && method === 'GET') {
      const version = versions.find((item) => item.id === versionPath[1]);
      return version
        ? jsonRoute(version)(route)
        : jsonRoute(
            { error: 'not_found', message: 'Version not found', status_code: 404 },
            404,
          )(route);
    }
    const currentPath = path.match(/^\/v1\/studio\/tracks\/(t\d+)\/current$/);
    if (currentPath && method === 'PUT') {
      const track = tracks.find((item) => item.id === currentPath[1]);
      if (!track)
        return jsonRoute(
          { error: 'not_found', message: 'Track not found', status_code: 404 },
          404,
        )(route);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      currentRequests.push(body);
      const planId =
        typeof body.plan_version_id === 'string'
          ? body.plan_version_id
          : track.current_plan_version_id;
      const lyricsId =
        'lyrics_version_id' in body
          ? (body.lyrics_version_id as string | null)
          : track.current_lyrics_version_id;
      const lyrics = versions.find(
        (version) => version.id === lyricsId && version.kind === 'lyrics',
      );
      if (lyricsId && !planId)
        return jsonRoute(
          { error: 'plan_required', message: 'A plan is required', status_code: 409 },
          409,
        )(route);
      const planVersion = versions.find(
        (version) => version.id === planId && version.kind === 'plan',
      );
      const planContent = planVersion?.content as Plan | undefined;
      const lyricsContent = lyrics?.content as Lyrics | undefined;
      if (
        lyrics &&
        (!planContent ||
          planContent.instrumental ||
          lyricsContent?.sections.some(
            (item) =>
              !planContent.sections.some(
                (section) =>
                  section.id === item.section_id &&
                  !section.instrumental &&
                  section.kind !== 'instrumental',
              ),
          ))
      )
        return jsonRoute(
          {
            error: 'lyrics_incompatible_with_plan',
            message: 'Incompatible lyrics',
            status_code: 409,
          },
          409,
        )(route);
      track.current_plan_version_id = planId;
      track.current_lyrics_version_id = lyricsId;
      versions.forEach((version) => {
        if (version.track_id === track.id)
          version.is_current = version.id === planId || version.id === lyricsId;
      });
      return jsonRoute(track)(route);
    }
    if (path === '/v1/studio/tracks/t1/exports/suno' && method === 'GET') {
      const url = new URL(route.request().url());
      const planId = url.searchParams.get('plan_version_id') ?? tracks[0]?.current_plan_version_id;
      const lyricsId =
        url.searchParams.get('lyrics_version_id') ?? tracks[0]?.current_lyrics_version_id;
      const planVersion = versions.find(
        (version) => version.id === planId && version.kind === 'plan',
      );
      const lyricsVersion = versions.find(
        (version) => version.id === lyricsId && version.kind === 'lyrics',
      );
      if (!planVersion)
        return jsonRoute(
          { error: 'plan_required', message: 'Plan required', status_code: 409 },
          409,
        )(route);
      const plan = planVersion.content as Plan;
      const lyrics = lyricsVersion?.content as Lyrics | undefined;
      const renderedLyrics = plan.sections
        .map((section) => {
          const lyricSection = lyrics?.sections.find((item) => item.section_id === section.id);
          return [
            `[${section.label ?? section.kind.replace(/_/g, '-')}]`,
            ...(lyricSection?.lines.flatMap((line) => [
              ...(line.delivery?.length ? [`[${line.delivery.join(', ')}]`] : []),
              line.text,
            ]) ?? []),
          ].join('\n');
        })
        .join('\n\n');
      const style = [...plan.global_style.tags].join(', ');
      const exclude = plan.global_style.avoid.join(', ');
      const length = (text: string) => Array.from(text).length;
      return jsonRoute({
        target: 'suno',
        renderer_version: 'suno-fixture-v1',
        plan_version_id: planVersion.id,
        lyrics_version_id: lyricsVersion?.id ?? null,
        title: plan.title,
        style,
        exclude,
        lyrics: renderedLyrics,
        instrumental: plan.instrumental,
        fields: {
          title: { length: length(plan.title), limit: null, within_limit: true },
          style: { length: length(style), limit: 1000, within_limit: length(style) <= 1000 },
          exclude: { length: length(exclude), limit: 1000, within_limit: length(exclude) <= 1000 },
          lyrics: {
            length: length(renderedLyrics),
            limit: 5000,
            within_limit: length(renderedLyrics) <= 5000,
          },
        },
        warnings: [],
      })(route);
    }
    if (/^\/v1\/studio\/tracks\/t\d+$/.test(path)) {
      const id = path.split('/').at(-1);
      const track = tracks.find((item) => item.id === id);
      const plan =
        versions.find(
          (version) => version.id === track?.current_plan_version_id && version.kind === 'plan',
        ) ?? null;
      const lyrics =
        versions.find(
          (version) => version.id === track?.current_lyrics_version_id && version.kind === 'lyrics',
        ) ?? null;
      const samplePlan = {
        content: {
          title: 'Song',
          instrumental: false,
          references: [],
          sections: [
            { id: 'verse', kind: 'verse', label: 'Verse', delivery: [], instrumental: false },
          ],
          global_style: { tags: ['dream pop'], avoid: [] },
        },
      };
      const sampleLyrics = {
        content: {
          language: 'en',
          sections: [{ section_id: 'verse', lines: [{ text: 'A line of lyrics', delivery: [] }] }],
        },
      };
      return jsonRoute({
        ...track,
        current_plan: plan ?? (emptyTrackDocuments ? null : samplePlan),
        current_lyrics: lyrics ?? (emptyTrackDocuments ? null : sampleLyrics),
        current_audio: null,
      })(route);
    }
    return route.continue();
  });
  return { currentRequests };
}
