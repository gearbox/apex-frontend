import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
import { makeWanModelInfo } from '../../mocks/fixtures/wan';
import { makeGrokVideoModelInfo } from '../../mocks/factories/providers';
import { normalizeVideoParams, videoLimits, videoParameterViolation } from './videoParams';

const clip = (duration_ms: number | null): SourceMediaDraft => ({
  assetRef: 'upload:clip',
  mediaType: 'video',
  role: null,
  previewUrl: null,
  label: null,
  available: true,
  media: { url: '', content_type: 'video/mp4', size_bytes: 1, duration_ms },
});
describe('discovery video parameters', () => {
  it('does not fabricate unresolved constraints', () => {
    expect(videoLimits(null, 't2v', [])).toBeNull();
    expect(videoLimits(makeWanModelInfo({ video: null }), 't2v', [])).toBeNull();
    expect(
      videoLimits(
        makeWanModelInfo({ video: { ...makeWanModelInfo().video!, resolutions: ['future'] } }),
        't2v',
        [],
      ),
    ).toBeNull();
  });
  it('uses the advertised minimum and every generated resolution', () => {
    const limits = videoLimits(makeWanModelInfo(), 't2v', [])!;
    expect(limits).toMatchObject({
      minDuration: 2,
      maxDuration: 30,
      resolutions: ['480p', '720p', '1080p'],
    });
    expect(normalizeVideoParams(limits, 1, '1080p')).toEqual({ duration: 2, resolution: '1080p' });
    expect(normalizeVideoParams(limits, 99, '480p')).toEqual({ duration: 30, resolution: '480p' });
  });
  it('uses 720p when offered, otherwise the first advertised resolution', () => {
    const model = makeWanModelInfo();
    const limits = videoLimits(
      { ...model, video: { ...model.video!, resolutions: ['1080p'] } },
      't2v',
      [],
    )!;
    expect(normalizeVideoParams(limits, 5, '720p').resolution).toBe('1080p');
  });
  it('caps output using each rounded-up source and disables impossible extensions', () => {
    expect(videoLimits(makeWanModelInfo(), 'v2v', [clip(12000)])?.maxDuration).toBe(18);
    expect(videoLimits(makeWanModelInfo(), 'v2v', [clip(6400)])?.maxDuration).toBe(23);
    expect(videoLimits(makeWanModelInfo(), 'v2v', [clip(29000)])?.sourceTooLongToExtend).toBe(true);
    expect(videoLimits(makeWanModelInfo(), 'v2v', [clip(null)])?.maxDuration).toBe(30);
    expect(videoLimits(makeGrokVideoModelInfo(), 'v2v', [clip(12000)])?.maxDuration).toBe(15);
  });
  it.each([null, 0, 2147483647, -1, 2147483648, 1.5, NaN])(
    'validates seed %s from discovery',
    (videoSeed) => {
      generationStore.reset();
      const state = { ...get(generationStore), mode: 't2v', videoSeed };
      expect(videoParameterViolation(state, makeWanModelInfo()) === null).toBe(
        videoSeed === null || videoSeed === 0 || videoSeed === 2147483647,
      );
    },
  );
});
