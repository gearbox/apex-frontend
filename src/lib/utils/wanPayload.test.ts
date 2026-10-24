import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
import { makeWanModelInfo } from '../../mocks/fixtures/wan';
import { makeGrokVideoModelInfo } from '../../mocks/factories/providers';
import { buildGeneratePayload, validateSourceMedia } from './generatePayload';

const model = makeWanModelInfo();
function sources(mode: string): SourceMediaDraft[] {
  if (mode === 't2v') return [];
  return (
    mode === 'flf2v'
      ? (['first_frame', 'last_frame'] as const)
      : [mode === 'i2v' ? ('first_frame' as const) : null]
  ).map((role, index) => ({
    assetRef: `upload:${index}`,
    mediaType: mode === 'v2v' ? 'video' : 'image',
    available: true,
    role,
    previewUrl: null,
    label: null,
    media: null,
  }));
}
beforeEach(() => generationStore.reset());
describe('Wan wire contract', () => {
  it.each(
    ['t2v', 'i2v', 'flf2v', 'v2v', 'r2v'].flatMap((mode) =>
      [null, '16:9' as const].map((ratio) => ({ mode, ratio })),
    ),
  )('keeps video ratio separate in $mode ($ratio)', ({ mode, ratio }) => {
    const payload = buildGeneratePayload(
      {
        ...get(generationStore),
        mode,
        model: 'wan3.0-video',
        sourceMedia: sources(mode),
        aspectRatio: '3:4',
        videoAspectRatio: ratio,
      },
      model,
    );
    expect(payload.aspect_ratio).toBe(
      ['t2v', 'r2v'].includes(mode) && ratio !== null ? ratio : undefined,
    );
  });
  it.each([null, true, false])('only sends supported non-null optional values (%s)', (value) => {
    const state = {
      ...get(generationStore),
      mode: 't2v',
      model: 'wan3.0-video' as const,
      audio: value,
      promptExtend: value,
    };
    const wan = buildGeneratePayload(state, model);
    expect(wan.audio).toBe(value ?? undefined);
    expect(wan.prompt_extend).toBe(value ?? undefined);
    const grok = buildGeneratePayload(state, makeGrokVideoModelInfo());
    expect(grok).not.toHaveProperty('audio');
    expect(grok).not.toHaveProperty('prompt_extend');
  });
  it('normalizes duration and resolution and does not send image overrides to video', () => {
    const payload = buildGeneratePayload(
      {
        ...get(generationStore),
        mode: 't2v',
        videoDuration: 1,
        videoResolution: '1080p',
        seed: -1,
        steps: 20,
        customWidth: 1024,
        customHeight: 1024,
        sizingMode: 'custom',
      },
      model,
    );
    expect(payload).toMatchObject({ duration: 2, resolution: '1080p' });
    for (const key of [
      'seed',
      'steps',
      'width',
      'height',
      'cfg',
      'sampler',
      'scheduler',
      'denoise',
      'image_resolution',
    ])
      expect(payload).not.toHaveProperty(key);
  });
  it('rejects invalid video seed before making a payload', () => {
    expect(() =>
      buildGeneratePayload({ ...get(generationStore), mode: 't2v', videoSeed: -1 }, model),
    ).toThrow(/integer/);
    expect(
      buildGeneratePayload({ ...get(generationStore), mode: 't2v', videoSeed: 0 }, model).seed,
    ).toBe(0);
    expect(
      buildGeneratePayload(
        { ...get(generationStore), mode: 't2v', videoSeed: 8 },
        makeGrokVideoModelInfo(),
      ),
    ).not.toHaveProperty('seed');
  });
  it('validates source limits only after availability, role and cardinality', () => {
    const source = {
      ...sources('v2v')[0],
      media: { url: '', content_type: 'video/webm', size_bytes: 1, duration_ms: 5000 },
    };
    const state = { ...get(generationStore), mode: 'v2v', sourceMedia: [source] };
    expect(validateSourceMedia(state, model).message).toMatch(/MOV.*MP4/);
    expect(
      validateSourceMedia({ ...state, sourceMedia: [{ ...source, available: false }] }, model)
        .message,
    ).toMatch(/unavailable/);
    expect(() => buildGeneratePayload(state, model)).toThrow(/MOV.*MP4/);
  });
});
