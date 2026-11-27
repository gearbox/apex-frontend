import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '$lib/api/errors';
import {
  buildSong,
  draftFromDocuments,
  type LyricsDocument,
  type Pair,
  type PlanDocument,
} from './songDraft';
import { saveSong, SongSaveError, type SongSaveApi } from './saveSong';

const plan1: PlanDocument = {
  title: 'Song',
  instrumental: false,
  references: [],
  global_style: { tags: [], avoid: [] },
  sections: [{ id: 's1', kind: 'verse', label: null, delivery: [], instrumental: false }],
};
const lyrics1: LyricsDocument = {
  language: 'en',
  sections: [{ section_id: 's1', lines: [{ text: 'First line', delivery: [] }] }],
};
const base: Pair = { plan: 'p1', lyrics: 'l1' };

function snapshot(change: 'none' | 'plan' | 'lyrics' | 'remove' | 'both') {
  const draft = draftFromDocuments(plan1, lyrics1, { language: '' });
  if (change === 'plan' || change === 'both') draft.tempo = '120';
  if (change === 'lyrics' || change === 'both') draft.sections[0]!.lyrics = 'Changed line';
  if (change === 'remove') draft.sections[0]!.lyrics = '';
  return buildSong(draft);
}

function api(
  options: {
    pairs?: Pair[];
    planError?: unknown;
    lyricsError?: unknown;
    missingVersion?: string;
  } = {},
) {
  const calls: string[] = [];
  const pairs = [...(options.pairs ?? [base, base, base])];
  const value: SongSaveApi = {
    async fetchServerPair() {
      calls.push('fetch');
      return pairs.shift() ?? base;
    },
    async loadVersionContent(id) {
      calls.push(`load:${id}`);
      if (id === options.missingVersion)
        throw new ApiRequestError({ error: 'not_found', message: 'Not found', status_code: 404 });
      return id === 'p1' ? plan1 : lyrics1;
    },
    async createPlan(body) {
      calls.push('plan');
      if (options.planError) throw options.planError;
      expect(body.make_current).toBe(false);
      return { id: 'p2', version_number: 2 };
    },
    async createLyrics(body) {
      calls.push('lyrics');
      if (options.lyricsError) throw options.lyricsError;
      expect(body.make_current).toBe(false);
      return { id: 'l2', version_number: 2 };
    },
    async setCurrent(body) {
      calls.push(`current:${body.plan_version_id}:${body.lyrics_version_id}`);
    },
  };
  return { api: value, calls };
}

describe('saveSong version orchestration', () => {
  it('creates plan then lyrics as not current, then switches the pair once', async () => {
    const { api: client, calls } = api();
    const result = await saveSong(client, { snapshot: snapshot('both'), base });
    expect(result).toEqual({
      kind: 'saved',
      created: { plan: 2, lyrics: 2 },
      lyricsRemoved: false,
      pair: { plan: 'p2', lyrics: 'l2' },
    });
    expect(calls).toEqual([
      'fetch',
      'load:p1',
      'load:l1',
      'fetch',
      'plan',
      'lyrics',
      'fetch',
      'current:p2:l2',
    ]);
  });

  it('keeps unchanged lyrics when only the plan changes', async () => {
    const { api: client, calls } = api();
    const result = await saveSong(client, { snapshot: snapshot('plan'), base });
    expect(result.kind).toBe('saved');
    expect(calls).toContain('current:p2:l1');
    expect(calls.filter((call) => call === 'lyrics')).toHaveLength(0);
  });

  it('returns a conflict before loading or writing when the current pair moved', async () => {
    const changed = { plan: 'p9', lyrics: 'l9' };
    const { api: client, calls } = api({ pairs: [changed] });
    expect(await saveSong(client, { snapshot: snapshot('both'), base })).toEqual({
      kind: 'conflict',
      server: changed,
    });
    expect(calls).toEqual(['fetch']);
  });

  it('branches from the base after the exact conflict pair is accepted', async () => {
    const server = { plan: 'p9', lyrics: 'l9' };
    const { api: client, calls } = api({ pairs: [server, server, server] });
    await saveSong(client, { snapshot: snapshot('both'), base, accepted: { server } });
    expect(calls).toContain('current:p2:l2');
  });

  it('asks again when the accepted pair changes during the save', async () => {
    const accepted = { plan: 'p9', lyrics: 'l9' };
    const moved = { plan: 'p10', lyrics: 'l10' };
    const { api: client, calls } = api({ pairs: [accepted, accepted, moved] });
    expect(
      await saveSong(client, { snapshot: snapshot('plan'), base, accepted: { server: accepted } }),
    ).toEqual({
      kind: 'conflict',
      server: moved,
    });
    expect(calls).not.toContain('current:p2:l1');
  });

  it('treats version_unchanged as the parent version', async () => {
    const unchanged = new ApiRequestError({
      error: 'version_unchanged',
      message: 'No change',
      status_code: 409,
    });
    const { api: client, calls } = api({ planError: unchanged });
    expect(await saveSong(client, { snapshot: snapshot('plan'), base })).toEqual({
      kind: 'nothing',
    });
    expect(calls).not.toContain('current:p2:l1');
  });

  it('asks before removing lyrics from the current pair', async () => {
    const { api: client, calls } = api();
    expect(await saveSong(client, { snapshot: snapshot('remove'), base })).toEqual({
      kind: 'confirm_remove_lyrics',
      server: base,
    });
    expect(calls).not.toContain('plan');
    expect(calls).not.toContain('current:p2:null');
  });

  it('re-bases only after explicit confirmation that a base version is missing', async () => {
    const { api: client } = api({ missingVersion: 'p1' });
    expect(await saveSong(client, { snapshot: snapshot('plan'), base })).toEqual({
      kind: 'base_missing',
      server: base,
    });
  });

  it('never switches the pair when lyrics creation fails after a plan write', async () => {
    const { api: client, calls } = api({ lyricsError: new Error('failed') });
    await expect(saveSong(client, { snapshot: snapshot('both'), base })).rejects.toMatchObject({
      name: 'SongSaveError',
      step: 'lyrics',
    } satisfies Partial<SongSaveError>);
    expect(calls).not.toContain('current:p2:l2');
  });
});
