import { it, expect } from 'vitest';
import { get } from 'svelte/store';
import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
import { makeWanModelInfo } from '../../mocks/fixtures/wan';
import { makeGrokVideoModelInfo } from '../../mocks/factories/providers';
import { billedSecondsForRequest } from './pricing';
it('prices rounded input seconds only when discovery declares them billable', () => {
  generationStore.reset();
  const clip: SourceMediaDraft = {
    assetRef: 'upload:clip',
    mediaType: 'video',
    available: true,
    role: null,
    label: null,
    previewUrl: null,
    media: { url: '', content_type: 'video/mp4', size_bytes: 1, duration_ms: 6400 },
  };
  const state = { ...get(generationStore), sourceMedia: [clip], videoDuration: 5 };
  expect(billedSecondsForRequest(state, makeWanModelInfo(), 'v2v')).toBe(12);
  expect(billedSecondsForRequest(state, makeGrokVideoModelInfo(), 'v2v')).toBe(5);
  expect(
    billedSecondsForRequest(
      { ...state, sourceMedia: [{ ...clip, media: null }] },
      makeWanModelInfo(),
      'v2v',
    ),
  ).toBeNull();
  expect(billedSecondsForRequest(state, makeWanModelInfo(), 't2i')).toBe(0);
});
