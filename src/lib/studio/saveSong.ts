import { ApiRequestError } from '$lib/api/errors';
import type { components } from '$lib/api/types';
import type { BuiltSong, LyricsDocument, Pair, PlanDocument } from './songDraft';
import { sameLyrics, samePlan } from './songDraft';

export type PlanVersionCreate = components['schemas']['PlanVersionCreate'];
export type LyricsVersionCreate = components['schemas']['LyricsVersionCreate'];

export interface SongSaveApi {
  fetchServerPair(): Promise<Pair>;
  loadVersionContent(id: string): Promise<PlanDocument | LyricsDocument>;
  createPlan(body: PlanVersionCreate): Promise<{ id: string; version_number: number }>;
  createLyrics(body: LyricsVersionCreate): Promise<{ id: string; version_number: number }>;
  setCurrent(body: {
    plan_version_id: string | null;
    lyrics_version_id: string | null;
  }): Promise<void>;
}

export type SaveOutcome =
  | {
      kind: 'saved';
      created: { plan?: number; lyrics?: number };
      lyricsRemoved: boolean;
      pair: Pair;
    }
  | { kind: 'nothing' }
  | { kind: 'conflict'; server: Pair }
  | { kind: 'base_missing'; server: Pair }
  | { kind: 'confirm_remove_lyrics'; server: Pair };

export interface AcceptedSave {
  server: Pair;
  removeLyrics?: boolean;
}

export class SongSaveError extends Error {
  constructor(
    readonly step: 'plan' | 'lyrics' | 'current',
    readonly cause: unknown,
  ) {
    super(`Song save failed during ${step}`, { cause });
    this.name = 'SongSaveError';
  }
}

function samePair(a: Pair, b: Pair): boolean {
  return a.plan === b.plan && a.lyrics === b.lyrics;
}

function isVersionUnchanged(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status_code === 409 &&
    error.error === 'version_unchanged'
  );
}

function isMissingBase(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status_code === 404 || error.error === 'parent_version_not_found')
  );
}

function documentFromVersion<T extends PlanDocument | LyricsDocument>(
  value: PlanDocument | LyricsDocument,
  kind: 'plan' | 'lyrics',
): T {
  if ('title' in value !== (kind === 'plan')) throw new Error(`Expected ${kind} version content`);
  return value as T;
}

export async function saveSong(
  api: SongSaveApi,
  input: { snapshot: BuiltSong; base: Pair; accepted?: AcceptedSave },
): Promise<SaveOutcome> {
  const { snapshot, base, accepted } = input;
  let server = await api.fetchServerPair();
  if (!samePair(server, base) && (!accepted || !samePair(accepted.server, server)))
    return { kind: 'conflict', server };
  if (accepted && !samePair(accepted.server, server)) return { kind: 'conflict', server };

  let basePlan: PlanDocument | null = null;
  let baseLyrics: LyricsDocument | null = null;
  try {
    if (base.plan)
      basePlan = documentFromVersion<PlanDocument>(await api.loadVersionContent(base.plan), 'plan');
    if (base.lyrics)
      baseLyrics = documentFromVersion<LyricsDocument>(
        await api.loadVersionContent(base.lyrics),
        'lyrics',
      );
  } catch (error) {
    if (isMissingBase(error)) return { kind: 'base_missing', server };
    throw error;
  }

  const beforeWrite = await api.fetchServerPair();
  if (!samePair(beforeWrite, server) && (!accepted || !samePair(accepted.server, beforeWrite)))
    return { kind: 'conflict', server: beforeWrite };
  if (accepted && !samePair(accepted.server, beforeWrite))
    return { kind: 'conflict', server: beforeWrite };
  server = beforeWrite;

  if (snapshot.lyrics === null && server.lyrics !== null && !accepted?.removeLyrics) {
    return { kind: 'confirm_remove_lyrics', server };
  }

  let planTarget = base.plan;
  const created: { plan?: number; lyrics?: number } = {};
  if (!base.plan || !samePlan(snapshot.plan, basePlan)) {
    try {
      const result = await api.createPlan({
        kind: 'plan',
        content: snapshot.plan,
        parent_version_id: base.plan,
        make_current: false,
      });
      planTarget = result.id;
      created.plan = result.version_number;
    } catch (error) {
      if (isVersionUnchanged(error)) planTarget = base.plan;
      else if (isMissingBase(error)) return { kind: 'base_missing', server };
      else throw new SongSaveError('plan', error);
    }
  }

  let lyricsTarget = snapshot.lyrics === null ? null : base.lyrics;
  if (snapshot.lyrics !== null && (!base.lyrics || !sameLyrics(snapshot.lyrics, baseLyrics))) {
    if (!planTarget) throw new SongSaveError('lyrics', new Error('Lyrics require a plan version'));
    try {
      const result = await api.createLyrics({
        kind: 'lyrics',
        content: snapshot.lyrics,
        based_on_plan_version_id: planTarget,
        parent_version_id: base.lyrics,
        make_current: false,
      });
      lyricsTarget = result.id;
      created.lyrics = result.version_number;
    } catch (error) {
      if (isVersionUnchanged(error)) lyricsTarget = base.lyrics;
      else if (isMissingBase(error)) return { kind: 'base_missing', server };
      else throw new SongSaveError('lyrics', error);
    }
  }

  const target = { plan: planTarget, lyrics: lyricsTarget };
  // A pair confirmation applies to one exact pair. Recheck after version creation, before PUT.
  const latest = await api.fetchServerPair();
  if (!samePair(latest, server) && (!accepted || !samePair(accepted.server, latest))) {
    return { kind: 'conflict', server: latest };
  }
  if (accepted && !samePair(accepted.server, latest)) return { kind: 'conflict', server: latest };

  let switched = false;
  if (!samePair(target, latest)) {
    try {
      await api.setCurrent({ plan_version_id: target.plan, lyrics_version_id: target.lyrics });
      switched = true;
    } catch (error) {
      throw new SongSaveError('current', error);
    }
  }
  if (!Object.keys(created).length && !switched) return { kind: 'nothing' };
  return {
    kind: 'saved',
    created,
    lyricsRemoved: target.lyrics === null && latest.lyrics !== null,
    pair: target,
  };
}
