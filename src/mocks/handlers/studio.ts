import { http, HttpResponse } from 'msw';
import type { components } from '$lib/api/types';
import {
  makeArtist,
  makeCursorPage,
  makeMemory,
  makeProjectProfile,
  makeTrack,
  makeTrackDetail,
  makePlanVersion,
  makeLyricsVersion,
  makeVersionSummary,
  makeSunoExport,
  makeSunoImportResult,
  type MockProjectProfile,
  type MockTrack,
  type MockArtist,
  type MockMemory,
  type MockVersionSummary,
} from '../factories/studio';
import { MOCK_BASE_URL as BASE } from '../config';
import { sectionDisplayName } from '$lib/studio/sections';

type ArtistCreate = components['schemas']['ArtistCreate'];
type ArtistPatch = components['schemas']['ArtistPatch'];
type MemoryCreate = components['schemas']['MemoryCreate'];
type MemoryPatch = components['schemas']['MemoryPatch'];
type MockPlanVersion = components['schemas']['PlanVersionDetail'];
type MockLyricsVersion = components['schemas']['LyricsVersionDetail'];
type MockVersion = MockPlanVersion | MockLyricsVersion;

let artists: MockArtist[] = [];
let memories: MockMemory[] = [];
let nextArtistId = 1;
let nextMemoryId = 1;
let profiles: MockProjectProfile[] = [];
let tracks: MockTrack[] = [];
let libraryNames = new Map<string, string>();
let nextTrackId = 1;
let versions: MockVersion[] = [];
let nextVersionId = 1;
let nextSectionId = 1;
export function setStudioMockLibraryName(id: string, name: string): void {
  libraryNames.set(id, name);
  profiles = profiles.map((profile) =>
    profile.library_project_id === id ? { ...profile, name } : profile,
  );
}

export function studioMockTrackCount(projectId: string): number {
  return tracks.filter((track) => track.library_project_id === projectId).length;
}
export function removeStudioMockProject(projectId: string): void {
  profiles = profiles.filter((profile) => profile.library_project_id !== projectId);
  libraryNames.delete(projectId);
}

export function resetStudioMockStore(): void {
  artists = [];
  memories = [];
  nextArtistId = 1;
  nextMemoryId = 1;
  profiles = [];
  tracks = [];
  libraryNames = new Map();
  nextTrackId = 1;
  versions = [];
  nextVersionId = 1;
  nextSectionId = 1;
}

function apiError(status: number, error: string, message: string) {
  return HttpResponse.json({ error, message, status_code: status }, { status });
}

function pagination(url: URL, defaultLimit = 30, maxLimit = 50) {
  const requested = Number(url.searchParams.get('limit'));
  const limit =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, maxLimit) : defaultLimit;
  const rawCursor = url.searchParams.get('cursor');
  const offset = rawCursor && /^\d+$/.test(rawCursor) ? Number(rawCursor) : 0;
  return { limit, offset };
}

function cursorPage<Item>(items: Item[], url: URL, defaultLimit = 30) {
  const { limit, offset } = pagination(url, defaultLimit);
  const pageItems = items.slice(offset, offset + limit);
  const hasMore = offset + pageItems.length < items.length;
  return makeCursorPage(pageItems, limit, hasMore, hasMore ? String(offset + limit) : null);
}

function diaryOrder(a: MockMemory, b: MockMemory): number {
  if (a.occurred_on !== b.occurred_on) {
    if (a.occurred_on === null) return 1;
    if (b.occurred_on === null) return -1;
    return b.occurred_on.localeCompare(a.occurred_on);
  }
  const created = b.created_at.localeCompare(a.created_at);
  return created || b.id.localeCompare(a.id);
}

function activeMemoryCount(artistId: string): number {
  return memories.filter((memory) => memory.artist_id === artistId && memory.status === 'active')
    .length;
}

function versionSummary(version: MockVersion): MockVersionSummary {
  return makeVersionSummary({
    id: version.id,
    kind: version.kind,
    version_number: version.version_number,
    parent_version_id: version.parent_version_id,
    based_on_plan_version_id: version.kind === 'lyrics' ? version.based_on_plan_version_id : null,
    origin: version.origin,
    schema_version: version.schema_version,
    content_hash: version.content_hash,
    created_at: version.created_at,
    is_current: version.is_current,
  });
}

function trackDetail(track: MockTrack) {
  return makeTrackDetail({
    ...track,
    current_plan:
      (versions.find(
        (version) => version.id === track.current_plan_version_id && version.kind === 'plan',
      ) as MockPlanVersion | undefined) ?? null,
    current_lyrics:
      (versions.find(
        (version) => version.id === track.current_lyrics_version_id && version.kind === 'lyrics',
      ) as MockLyricsVersion | undefined) ?? null,
  });
}

function mockImportDocuments(
  track: MockTrack,
  request: components['schemas']['SunoImportRequest'],
) {
  const currentPlan = versions.find(
    (version) => version.id === track.current_plan_version_id && version.kind === 'plan',
  ) as MockPlanVersion | undefined;
  const sections: components['schemas']['PlanSection'][] = [];
  const lyricSections: components['schemas']['LyricsSection'][] = [];
  const lines = (request.lyrics ?? '').replace(/\r\n?/g, '\n').split('\n');
  let currentSection: components['schemas']['PlanSection'] | undefined;
  let currentLines: components['schemas']['LyricLine'][] = [];
  const flush = () => {
    if (!currentSection) return;
    sections.push(currentSection);
    if (currentLines.length)
      lyricSections.push({ section_id: currentSection.id, lines: currentLines });
    currentSection = undefined;
    currentLines = [];
  };
  const kinds: Record<string, components['schemas']['StudioSectionKind']> = {
    intro: 'intro',
    verse: 'verse',
    'pre-chorus': 'pre_chorus',
    chorus: 'chorus',
    'post-chorus': 'post_chorus',
    hook: 'hook',
    bridge: 'bridge',
    build: 'build',
    drop: 'drop',
    breakdown: 'breakdown',
    instrumental: 'instrumental',
    interlude: 'interlude',
    outro: 'outro',
  };
  for (const line of lines) {
    const header = /^\[([^\]]+)\]$/.exec(line.trim());
    if (header) {
      flush();
      const name = header[1].split(':', 1)[0].trim();
      const kindName = name.toLowerCase().replace(/\s+\d+$/, '');
      currentSection = {
        id: `section_mock_${nextSectionId++}`,
        kind: kinds[kindName] ?? 'interlude',
        ...(kinds[kindName] ? {} : { label: name }),
        delivery: [],
        instrumental: false,
      };
    } else if (line.trim()) {
      if (!currentSection) {
        currentSection = {
          id: `section_mock_${nextSectionId++}`,
          kind: 'verse',
          delivery: [],
          instrumental: false,
        };
      }
      currentLines.push({ text: line.trim(), delivery: [] });
    }
  }
  flush();
  const style = (request.style ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const exclude = (request.exclude ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const plan: components['schemas']['PlanDocument'] = {
    title: request.title ?? currentPlan?.content.title ?? track.title,
    instrumental: request.instrumental ?? currentPlan?.content.instrumental ?? false,
    global_style: { tags: style, avoid: exclude },
    references: [],
    sections,
  };
  const lyrics: components['schemas']['LyricsDocument'] | null = lyricSections.length
    ? { language: request.language ?? 'en', sections: lyricSections }
    : null;
  return { plan, lyrics };
}

function mockRenderedLyrics(
  plan: components['schemas']['PlanDocument'],
  lyrics: components['schemas']['LyricsDocument'] | null,
) {
  const sections = (plan.sections ?? []) as components['schemas']['PlanSection'][];
  const lyricSections = (lyrics?.sections ?? []) as components['schemas']['LyricsSection'][];
  return sections
    .map((section) => {
      const label = sectionDisplayName(section, sections);
      const entry = lyricSections.find((item) => item.section_id === section.id);
      const lines = (entry?.lines ?? []) as components['schemas']['LyricLine'][];
      return [`[${label}]`, ...lines.map((line) => line.text)].join('\n');
    })
    .join('\n\n');
}

export const studioHandlers = [
  http.get(`${BASE}/v1/studio/projects`, ({ request }) =>
    HttpResponse.json(cursorPage(profiles, new URL(request.url))),
  ),
  http.get(`${BASE}/v1/studio/projects/:project_id`, ({ params }) => {
    const profile = profiles.find((item) => item.library_project_id === params.project_id);
    return profile ? HttpResponse.json(profile) : apiError(404, 'not_found', 'Project not found.');
  }),
  http.put(`${BASE}/v1/studio/projects/:project_id`, async ({ params, request }) => {
    const id = String(params.project_id);
    const body = (await request.json()) as components['schemas']['ProjectProfilePut'];
    if (!libraryNames.has(id)) return apiError(404, 'not_found', 'Library project not found.');
    if (body.artist_id && !artists.some((artist) => artist.id === body.artist_id))
      return apiError(404, 'artist_not_found', 'Artist not found.');
    const old = profiles.find((item) => item.library_project_id === id);
    const profile = makeProjectProfile({
      ...old,
      library_project_id: id,
      name: libraryNames.get(id) ?? old?.name ?? 'Project',
      release_kind: body.release_kind,
      artist_id: body.artist_id ?? null,
      concept: body.concept ?? null,
      track_count: tracks.filter((item) => item.library_project_id === id).length,
    });
    profiles = [...profiles.filter((item) => item.library_project_id !== id), profile];
    return HttpResponse.json(profile);
  }),
  http.delete(`${BASE}/v1/studio/projects/:project_id`, ({ params }) => {
    if (!profiles.some((profile) => profile.library_project_id === params.project_id))
      return apiError(404, 'not_found', 'Project not found.');
    if (tracks.some((item) => item.library_project_id === params.project_id))
      return apiError(409, 'project_has_tracks', 'Project has tracks.');
    profiles = profiles.filter((item) => item.library_project_id !== params.project_id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${BASE}/v1/studio/projects/:project_id/tracks`, ({ params }) => {
    if (!profiles.some((profile) => profile.library_project_id === params.project_id))
      return apiError(404, 'not_found', 'Project not found.');
    return HttpResponse.json(
      tracks
        .filter((item) => item.library_project_id === params.project_id)
        .sort((a, b) => a.position - b.position),
    );
  }),
  http.post(`${BASE}/v1/studio/projects/:project_id/tracks`, async ({ params, request }) => {
    const id = String(params.project_id);
    if (!profiles.some((profile) => profile.library_project_id === id))
      return apiError(404, 'not_found', 'Project not found.');
    const body = (await request.json()) as { title: string };
    const existing = tracks.filter((item) => item.library_project_id === id);
    if (existing.length >= 64) return apiError(409, 'track_limit_reached', 'Track limit reached.');
    const item = makeTrack({
      id: `track_mock_${nextTrackId++}`,
      library_project_id: id,
      title: body.title,
      position: existing.length,
    });
    tracks.push(item);
    profiles = profiles.map((profile) =>
      profile.library_project_id === id
        ? { ...profile, track_count: existing.length + 1 }
        : profile,
    );
    return HttpResponse.json(item, { status: 201 });
  }),
  http.put(`${BASE}/v1/studio/projects/:project_id/tracks/order`, async ({ params, request }) => {
    if (!profiles.some((profile) => profile.library_project_id === params.project_id))
      return apiError(404, 'not_found', 'Project not found.');
    const body = (await request.json()) as { track_ids: string[] };
    const existing = tracks.filter((item) => item.library_project_id === params.project_id);
    if (
      body.track_ids.length !== existing.length ||
      new Set(body.track_ids).size !== existing.length ||
      body.track_ids.some((id) => !existing.some((item) => item.id === id))
    )
      return apiError(422, 'track_order_mismatch', 'Track order changed.');
    tracks = tracks.map((item) =>
      item.library_project_id === params.project_id
        ? { ...item, position: body.track_ids.indexOf(item.id) }
        : item,
    );
    return HttpResponse.json(
      tracks
        .filter((item) => item.library_project_id === params.project_id)
        .sort((a, b) => a.position - b.position),
    );
  }),
  http.get(`${BASE}/v1/studio/tracks/:track_id`, ({ params }) => {
    const item = tracks.find((track) => track.id === params.track_id);
    return item
      ? HttpResponse.json(trackDetail(item))
      : apiError(404, 'not_found', 'Track not found.');
  }),
  http.get(`${BASE}/v1/studio/tracks/:track_id/versions`, ({ params, request }) => {
    const trackId = String(params.track_id);
    if (!tracks.some((track) => track.id === trackId))
      return apiError(404, 'not_found', 'Track not found.');
    const url = new URL(request.url);
    const kind = url.searchParams.get('kind');
    const items = versions
      .filter((version) => version.track_id === trackId && (!kind || version.kind === kind))
      .sort((a, b) => b.version_number - a.version_number)
      .map(versionSummary);
    return HttpResponse.json(cursorPage(items, url));
  }),
  http.get(`${BASE}/v1/studio/versions/:version_id`, ({ params }) => {
    const version = versions.find((item) => item.id === params.version_id);
    return version ? HttpResponse.json(version) : apiError(404, 'not_found', 'Version not found.');
  }),
  http.delete(`${BASE}/v1/studio/versions/:version_id`, ({ params }) => {
    const version = versions.find((item) => item.id === params.version_id);
    if (!version) return apiError(404, 'not_found', 'Version not found.');
    if (version.is_current) return apiError(409, 'version_is_current', 'The version is current.');
    const children = versions.filter((item) => item.parent_version_id === version.id).length;
    if (children)
      return HttpResponse.json(
        {
          error: 'version_has_children',
          message: 'Version has children.',
          status_code: 409,
          detail: { count: children },
        },
        { status: 409 },
      );
    const lyricBases = versions.filter(
      (item) => item.kind === 'lyrics' && item.based_on_plan_version_id === version.id,
    ).length;
    if (lyricBases)
      return HttpResponse.json(
        {
          error: 'version_is_lyrics_base',
          message: 'Version is a lyrics base.',
          status_code: 409,
          detail: { count: lyricBases },
        },
        { status: 409 },
      );
    versions = versions.filter((item) => item.id !== version.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put(`${BASE}/v1/studio/tracks/:track_id/current`, async ({ params, request }) => {
    const index = tracks.findIndex((track) => track.id === params.track_id);
    if (index < 0) return apiError(404, 'not_found', 'Track not found.');
    const body = (await request.json()) as components['schemas']['CurrentPut'];
    const track = tracks[index];
    const planId = body.plan_version_id ?? track.current_plan_version_id;
    const lyricsId =
      body.lyrics_version_id === undefined
        ? track.current_lyrics_version_id
        : body.lyrics_version_id;
    const plan = versions.find((version) => version.id === planId && version.kind === 'plan');
    const lyrics = versions.find((version) => version.id === lyricsId && version.kind === 'lyrics');
    if (body.plan_version_id && !plan)
      return apiError(404, 'plan_version_not_found', 'Plan version not found.');
    if (lyricsId && !lyrics) return apiError(404, 'not_found', 'Lyrics version not found.');
    if (lyricsId && !planId) return apiError(409, 'plan_required', 'A plan is required.');
    if (lyrics && plan && (lyrics as MockLyricsVersion).based_on_plan_version_id !== plan.id)
      return apiError(409, 'lyrics_incompatible_with_plan', 'Lyrics are incompatible.');
    tracks[index] = {
      ...track,
      current_plan_version_id: planId,
      current_lyrics_version_id: lyricsId,
    };
    versions = versions.map((version) =>
      version.track_id !== track.id
        ? version
        : { ...version, is_current: version.id === planId || version.id === lyricsId },
    );
    return HttpResponse.json(tracks[index]);
  }),
  http.get(`${BASE}/v1/studio/tracks/:track_id/exports/suno`, ({ params, request }) => {
    const track = tracks.find((item) => item.id === params.track_id);
    if (!track) return apiError(404, 'not_found', 'Track not found.');
    const url = new URL(request.url);
    const explicitPlan = url.searchParams.get('plan_version_id');
    const explicitLyrics = url.searchParams.get('lyrics_version_id');
    const planId = explicitPlan ?? track.current_plan_version_id;
    const plan = versions.find((version) => version.id === planId && version.kind === 'plan') as
      MockPlanVersion | undefined;
    if (!plan) return apiError(409, 'plan_required', 'A plan is required.');
    const lyricsId = explicitLyrics ?? (explicitPlan ? null : track.current_lyrics_version_id);
    const lyrics = versions.find(
      (version) => version.id === lyricsId && version.kind === 'lyrics',
    ) as MockLyricsVersion | undefined;
    if (lyrics && lyrics.based_on_plan_version_id !== plan.id)
      return apiError(409, 'lyrics_incompatible_with_plan', 'Lyrics are incompatible.');
    const styleTags = [
      ...(plan.content.global_style?.tags ?? []),
      ...(plan.content.tempo_bpm ? [`${plan.content.tempo_bpm} BPM`] : []),
    ];
    const style = styleTags.join(', ');
    const exclude = (plan.content.global_style?.avoid ?? []).join(', ');
    const renderedLyrics = mockRenderedLyrics(plan.content, lyrics?.content ?? null);
    const count = (text: string) => Array.from(text).length;
    return HttpResponse.json(
      makeSunoExport({
        plan_version_id: plan.id,
        lyrics_version_id: lyrics?.id ?? null,
        title: plan.content.title,
        style,
        exclude,
        lyrics: renderedLyrics,
        instrumental: plan.content.instrumental ?? false,
        fields: {
          title: { length: count(plan.content.title), limit: null, within_limit: true },
          style: { length: count(style), limit: 1000, within_limit: count(style) <= 1000 },
          exclude: { length: count(exclude), limit: 1000, within_limit: count(exclude) <= 1000 },
          lyrics: {
            length: count(renderedLyrics),
            limit: 5000,
            within_limit: count(renderedLyrics) <= 5000,
          },
        },
      }),
    );
  }),
  http.post(`${BASE}/v1/studio/tracks/:track_id/imports/suno`, async ({ params, request }) => {
    const trackIndex = tracks.findIndex((item) => item.id === params.track_id);
    if (trackIndex < 0) return apiError(404, 'not_found', 'Track not found.');
    const track = tracks[trackIndex];
    const body = (await request.json()) as components['schemas']['SunoImportRequest'];
    const { plan, lyrics } = mockImportDocuments(track, body);
    const currentPlan = versions.find(
      (version) => version.id === track.current_plan_version_id && version.kind === 'plan',
    ) as MockPlanVersion | undefined;
    const currentLyrics = versions.find(
      (version) => version.id === track.current_lyrics_version_id && version.kind === 'lyrics',
    ) as MockLyricsVersion | undefined;
    const planUnchanged =
      !!currentPlan && JSON.stringify(currentPlan.content) === JSON.stringify(plan);
    const lyricsUnchanged =
      planUnchanged &&
      (lyrics === null
        ? currentLyrics === undefined
        : JSON.stringify(currentLyrics?.content) === JSON.stringify(lyrics));
    const resultBase = makeSunoImportResult({
      dry_run: body.dry_run ?? false,
      plan,
      lyrics,
      plan_unchanged: planUnchanged,
      lyrics_unchanged: lyricsUnchanged,
      created: !planUnchanged || !lyricsUnchanged,
    });
    if (body.dry_run) return HttpResponse.json(resultBase);
    if (planUnchanged && lyricsUnchanged)
      return HttpResponse.json({
        ...resultBase,
        plan_version: currentPlan ? versionSummary(currentPlan) : null,
        lyrics_version: currentLyrics ? versionSummary(currentLyrics) : null,
        created: false,
      });
    let planVersion = currentPlan;
    if (!planUnchanged) {
      const versionNumber =
        versions.filter((version) => version.track_id === track.id && version.kind === 'plan')
          .length + 1;
      planVersion = makePlanVersion({
        id: `plan_mock_${String(nextVersionId++).padStart(3, '0')}`,
        track_id: track.id,
        version_number: versionNumber,
        parent_version_id: track.current_plan_version_id,
        origin: 'import',
        is_current: true,
        content: plan,
      });
      versions = versions.map((version) =>
        version.track_id === track.id && version.kind === 'plan'
          ? { ...version, is_current: false }
          : version,
      );
      versions.push(planVersion);
    }
    let lyricsVersion: MockLyricsVersion | undefined;
    if (lyrics) {
      if (lyricsUnchanged && currentLyrics && planUnchanged) lyricsVersion = currentLyrics;
      else {
        const versionNumber =
          versions.filter((version) => version.track_id === track.id && version.kind === 'lyrics')
            .length + 1;
        lyricsVersion = makeLyricsVersion({
          id: `lyrics_mock_${String(nextVersionId++).padStart(3, '0')}`,
          track_id: track.id,
          version_number: versionNumber,
          parent_version_id: track.current_lyrics_version_id,
          based_on_plan_version_id: planVersion!.id,
          origin: 'import',
          is_current: true,
          content: lyrics,
        });
        versions = versions.map((version) =>
          version.track_id === track.id && version.kind === 'lyrics'
            ? { ...version, is_current: false }
            : version,
        );
        versions.push(lyricsVersion);
      }
    }
    const nextTrack = {
      ...track,
      current_plan_version_id: planVersion?.id ?? track.current_plan_version_id,
      current_lyrics_version_id: lyricsVersion?.id ?? null,
    };
    tracks[trackIndex] = nextTrack;
    return HttpResponse.json(
      {
        ...resultBase,
        dry_run: false,
        plan_version: planVersion ? versionSummary(planVersion) : null,
        lyrics_version: lyricsVersion ? versionSummary(lyricsVersion) : null,
        created: true,
      },
      { status: 201 },
    );
  }),
  http.patch(`${BASE}/v1/studio/tracks/:track_id`, async ({ params, request }) => {
    const body = (await request.json()) as { title: string };
    const index = tracks.findIndex((item) => item.id === params.track_id);
    if (index < 0) return apiError(404, 'not_found', 'Track not found.');
    tracks[index] = { ...tracks[index], title: body.title };
    return HttpResponse.json(tracks[index]);
  }),
  http.delete(`${BASE}/v1/studio/tracks/:track_id`, ({ params }) => {
    const item = tracks.find((track) => track.id === params.track_id);
    if (!item) return apiError(404, 'not_found', 'Track not found.');
    tracks = tracks.filter((track) => track.id !== params.track_id);
    if (item)
      profiles = profiles.map((profile) =>
        profile.library_project_id === item.library_project_id
          ? { ...profile, track_count: Math.max(0, profile.track_count - 1) }
          : profile,
      );
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${BASE}/v1/studio/artists`, ({ request }) => {
    const url = new URL(request.url);
    const { limit } = pagination(url, 30);
    return HttpResponse.json(cursorPage(artists, url, limit));
  }),

  http.post(`${BASE}/v1/studio/artists`, async ({ request }) => {
    const body = (await request.json()) as ArtistCreate;
    if (artists.length >= 50) {
      return apiError(409, 'artist_limit_reached', 'The artist limit has been reached.');
    }
    if (artists.some((artist) => artist.name.toLowerCase() === body.name.trim().toLowerCase())) {
      return apiError(409, 'artist_name_conflict', 'An artist with this name already exists.');
    }
    const now = new Date().toISOString();
    const artist = makeArtist({
      ...body,
      id: `artist_mock_${String(nextArtistId++).padStart(3, '0')}`,
      name: body.name,
      persona: body.persona ?? null,
      voice_notes: body.voice_notes ?? null,
      default_language: body.default_language ?? null,
      aesthetic_references: body.aesthetic_references ?? [],
      style_tags: body.style_tags ?? [],
      global_avoid: body.global_avoid ?? [],
      created_at: now,
      updated_at: now,
    });
    artists.push(artist);
    return HttpResponse.json(artist, { status: 201 });
  }),

  http.get(`${BASE}/v1/studio/artists/:artist_id`, ({ params }) => {
    const artist = artists.find((item) => item.id === params.artist_id);
    return artist
      ? HttpResponse.json(artist)
      : apiError(404, 'artist_not_found', 'Artist not found.');
  }),

  http.patch(`${BASE}/v1/studio/artists/:artist_id`, async ({ params, request }) => {
    const index = artists.findIndex((item) => item.id === params.artist_id);
    if (index < 0) return apiError(404, 'artist_not_found', 'Artist not found.');
    const patch = (await request.json()) as ArtistPatch;
    if (
      patch.name !== undefined &&
      artists.some(
        (artist) =>
          artist.id !== params.artist_id &&
          artist.name.toLowerCase() === patch.name!.trim().toLowerCase(),
      )
    ) {
      return apiError(409, 'artist_name_conflict', 'An artist with this name already exists.');
    }
    artists[index] = { ...artists[index], ...patch, updated_at: new Date().toISOString() };
    return HttpResponse.json(artists[index]);
  }),

  http.delete(`${BASE}/v1/studio/artists/:artist_id`, ({ params }) => {
    const index = artists.findIndex((item) => item.id === params.artist_id);
    if (index < 0) return apiError(404, 'artist_not_found', 'Artist not found.');
    artists.splice(index, 1);
    memories = memories.filter((memory) => memory.artist_id !== params.artist_id);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${BASE}/v1/studio/artists/:artist_id/memories`, ({ params, request }) => {
    const artistId = params.artist_id as string;
    if (!artists.some((artist) => artist.id === artistId)) {
      return apiError(404, 'artist_not_found', 'Artist not found.');
    }
    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? 'active';
    const items = memories
      .filter((memory) => memory.artist_id === artistId && memory.status === status)
      .sort(diaryOrder);
    return HttpResponse.json(cursorPage(items, url));
  }),

  http.post(`${BASE}/v1/studio/artists/:artist_id/memories`, async ({ params, request }) => {
    const artistId = params.artist_id as string;
    if (!artists.some((artist) => artist.id === artistId)) {
      return apiError(404, 'artist_not_found', 'Artist not found.');
    }
    if (activeMemoryCount(artistId) >= 200) {
      return apiError(409, 'memory_limit_reached', 'The active memory limit has been reached.');
    }
    const body = (await request.json()) as MemoryCreate;
    const now = new Date().toISOString();
    const memory = makeMemory({
      ...body,
      id: `memory_mock_${String(nextMemoryId++).padStart(3, '0')}`,
      artist_id: artistId,
      occurred_on: body.occurred_on ?? null,
      themes: body.themes ?? [],
      imagery: body.imagery ?? [],
      salience: body.salience ?? 3,
      status: 'active',
      origin: 'user',
      created_at: now,
      updated_at: now,
    });
    memories.push(memory);
    return HttpResponse.json(memory, { status: 201 });
  }),

  http.get(`${BASE}/v1/studio/memories/:memory_id`, ({ params }) => {
    const memory = memories.find((item) => item.id === params.memory_id);
    return memory
      ? HttpResponse.json(memory)
      : apiError(404, 'memory_not_found', 'Memory not found.');
  }),

  http.patch(`${BASE}/v1/studio/memories/:memory_id`, async ({ params, request }) => {
    const index = memories.findIndex((item) => item.id === params.memory_id);
    if (index < 0) return apiError(404, 'memory_not_found', 'Memory not found.');
    const patch = (await request.json()) as MemoryPatch;
    const memory = memories[index];
    if (
      patch.status === 'active' &&
      memory.status === 'archived' &&
      activeMemoryCount(memory.artist_id) >= 200
    ) {
      return apiError(409, 'memory_limit_reached', 'The active memory limit has been reached.');
    }
    memories[index] = { ...memory, ...patch, updated_at: new Date().toISOString() };
    return HttpResponse.json(memories[index]);
  }),

  http.delete(`${BASE}/v1/studio/memories/:memory_id`, ({ params }) => {
    const index = memories.findIndex((item) => item.id === params.memory_id);
    if (index < 0) return apiError(404, 'memory_not_found', 'Memory not found.');
    memories.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
