import { describe, expect, it } from 'vitest';
import { resolveGenerationMode, type ResolverSource } from './generationModeResolver';
import {
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  makeAishaVideoModelInfo,
  makeAishaImageModelInfo,
  makeAishaImageLiteModelInfo,
  makeModelInfo,
  generationModes,
} from '../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type GenerationModeInfo = components['schemas']['GenerationModeInfo'];

function image(assetRef: string, available = true): ResolverSource {
  return { assetRef, mediaType: 'image', available };
}

function video(assetRef: string, available = true): ResolverSource {
  return { assetRef, mediaType: 'video', available };
}

describe('resolveGenerationMode — no-source resolution', () => {
  it('resolves the sole no-source mode for an image model with no sources selected', () => {
    const modelInfo = makeGrokImageModelInfo(); // t2i (null) + i2i (source)
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [] })).toMatchObject({
      status: 'resolved',
      mode: 't2i',
    });
  });

  it('resolves the sole no-source mode for a video model with no sources selected', () => {
    const modelInfo = makeGrokVideoModelInfo(); // t2v / i2v / v2v
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [] })).toMatchObject({
      status: 'resolved',
      mode: 't2v',
    });
  });

  it('resolves t2i for the real Aisha Lite contract (t2i-only, no i2i)', () => {
    const modelInfo = makeAishaImageLiteModelInfo();
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [] })).toMatchObject({
      status: 'resolved',
      mode: 't2i',
    });
    // No i2i mode is advertised, so a stray image cannot resolve to anything.
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] }).status).toBe(
      'invalid',
    );
  });

  it('is ambiguous between multiple no-source modes, never resolved by advertised key order', () => {
    const forward = makeModelInfo({
      generation_modes: { 'mode-a': { source_media: null }, 'mode-b': { source_media: null } },
    });
    const reversed = makeModelInfo({
      generation_modes: { 'mode-b': { source_media: null }, 'mode-a': { source_media: null } },
    });

    for (const modelInfo of [forward, reversed]) {
      const result = resolveGenerationMode({ modelInfo, sourceMedia: [] });
      expect(result.status).toBe('ambiguous');
      if (result.status === 'ambiguous') expect(result.candidates).toEqual(['mode-a', 'mode-b']);
    }
  });
});

describe('resolveGenerationMode — explicit Type intent / incomplete drafts', () => {
  it('keeps an explicit I2I preference incomplete before a source is selected', () => {
    const modelInfo = makeGrokImageModelInfo();
    expect(
      resolveGenerationMode({ modelInfo, sourceMedia: [], preferredMode: 'i2i' }),
    ).toMatchObject({ status: 'incomplete', mode: 'i2i' });
  });

  it('keeps an explicit V2V preference incomplete before a video is selected', () => {
    const modelInfo = makeGrokVideoModelInfo();
    expect(
      resolveGenerationMode({ modelInfo, sourceMedia: [], preferredMode: 'v2v' }),
    ).toMatchObject({ status: 'incomplete', mode: 'v2v' });
  });

  it('keeps an explicit FLF2V preference incomplete with only one of two required images', () => {
    const modelInfo = makeAishaVideoModelInfo(); // flf2v: min 2, max 2, [first_frame, last_frame]
    expect(
      resolveGenerationMode({
        modelInfo,
        sourceMedia: [image('upload:1')],
        preferredMode: 'flf2v',
      }),
    ).toMatchObject({ status: 'incomplete', mode: 'flf2v' });
  });

  it('does not force a preferred mode that is no longer compatible', () => {
    const modelInfo = makeGrokImageModelInfo({
      generation_modes: generationModes(['t2i', 'i2i'], {
        i2i: { min: 1, max: 1, media_types: ['image'], roles: null },
      }),
    });
    // Two images over i2i's max: the preference is dropped, not forced.
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
      preferredMode: 'i2i',
    });
    expect(result.status).toBe('invalid');
  });
});

describe('resolveGenerationMode — source-driven candidate resolution', () => {
  it('resolves i2i from a single compatible image with no stronger preferred mode', () => {
    const modelInfo = makeGrokImageModelInfo();
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] })).toMatchObject({
      status: 'resolved',
      mode: 'i2i',
    });
  });

  it('resolves i2v from one image and v2v from one video on a Grok-shaped video model', () => {
    const modelInfo = makeGrokVideoModelInfo();
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] })).toMatchObject({
      status: 'resolved',
      mode: 'i2v',
    });
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [video('upload:2')] })).toMatchObject({
      status: 'resolved',
      mode: 'v2v',
    });
  });

  it('falls back to the unique no-source mode once the final source is removed with no preference', () => {
    const modelInfo = makeGrokImageModelInfo();
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [] })).toMatchObject({
      status: 'resolved',
      mode: 't2i',
    });
  });

  it('caps the real Aisha Image i2i contract at exactly one source (min 1, max 1)', () => {
    const modelInfo = makeAishaImageModelInfo();
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] })).toMatchObject({
      status: 'resolved',
      mode: 'i2i',
    });
    // A second image exceeds Aisha Image's real i2i cardinality — invalid, not
    // silently accepted the way the old (Grok-shaped) default fixture allowed.
    expect(
      resolveGenerationMode({
        modelInfo,
        sourceMedia: [image('upload:1'), image('upload:2')],
      }).status,
    ).toBe('invalid');
  });
});

describe('resolveGenerationMode — invalid resolution', () => {
  it('is invalid when the only selected source kind matches no advertised mode', () => {
    const modelInfo = makeGrokImageModelInfo(); // image-only i2i
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [video('upload:1')] }).status).toBe(
      'invalid',
    );
  });

  it('is invalid when the source count exceeds every candidate max', () => {
    const modelInfo = makeGrokImageModelInfo({
      generation_modes: generationModes(['t2i', 'i2i'], {
        i2i: { min: 1, max: 2, media_types: ['image'], roles: null },
      }),
    });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2'), image('upload:3')],
    });
    expect(result.status).toBe('invalid');
  });

  it('is invalid when the model advertises no source-consuming mode at all', () => {
    const modelInfo = makeModelInfo({ generation_modes: generationModes(['t2i']) });
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] }).status).toBe(
      'invalid',
    );
  });

  it('is invalid when the model advertises no generation modes', () => {
    const modelInfo = makeModelInfo({ generation_modes: {} });
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [] }).status).toBe('invalid');
  });

  it('is invalid when there is no model at all', () => {
    expect(resolveGenerationMode({ modelInfo: null, sourceMedia: [] }).status).toBe('invalid');
  });
});

describe('resolveGenerationMode — model switching', () => {
  it('recomputes purely from the new contract for the same sources, without mutating them', () => {
    const source: ResolverSource[] = [image('upload:1')];
    const modelA = makeGrokImageModelInfo(); // i2i accepts 1 image
    const modelB = makeAishaVideoModelInfo(); // i2v accepts 1 image (first_frame role)
    const modelC = makeGrokVideoModelInfo({
      generation_modes: generationModes(['t2v', 'v2v']), // no image-accepting mode
    });

    expect(resolveGenerationMode({ modelInfo: modelA, sourceMedia: source })).toMatchObject({
      status: 'resolved',
      mode: 'i2i',
    });
    expect(resolveGenerationMode({ modelInfo: modelB, sourceMedia: source })).toMatchObject({
      status: 'resolved',
      mode: 'i2v',
    });
    expect(resolveGenerationMode({ modelInfo: modelC, sourceMedia: source }).status).toBe(
      'invalid',
    );
    expect(source).toEqual([image('upload:1')]);
  });
});

describe('resolveGenerationMode — mandatory ambiguity regression: generic I2V vs FLF2V', () => {
  const syntheticModes: Record<string, GenerationModeInfo> = {
    i2v: { source_media: { min: 1, max: 2, media_types: ['image'], roles: null } },
    flf2v: {
      source_media: {
        min: 2,
        max: 2,
        media_types: ['image'],
        roles: ['first_frame', 'last_frame'],
      },
    },
  };
  const reversedModes: Record<string, GenerationModeInfo> = {
    flf2v: syntheticModes.flf2v,
    i2v: syntheticModes.i2v,
  };

  it('treats one image as a complete i2v with flf2v as a compatible incomplete expansion', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] });
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
    expect(result.completeCandidates).toEqual(['i2v']);
    expect(result.incompleteCandidates).toEqual(['flf2v']);
  });

  it('is ambiguous with two images and no semantic/preferred intent — must not resolve by key order', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
    });
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') expect(result.candidates).toEqual(['flf2v', 'i2v']);
  });

  it('keeps a preferred i2v resolved with two generic images', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
      preferredMode: 'i2v',
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
  });

  it('resolves the generic reference candidate (i2v) from a reference semantic intent', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
      semanticIntent: { kind: 'reference' },
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
  });

  it('resolves flf2v from a last_frame semantic role intent', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
      semanticIntent: { kind: 'role', role: 'last_frame' },
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'flf2v' });
  });

  it('is unaffected by advertised key order', () => {
    const forward = makeModelInfo({ generation_modes: syntheticModes });
    const reversed = makeModelInfo({ generation_modes: reversedModes });
    const sources = [image('upload:1'), image('upload:2')];

    expect(resolveGenerationMode({ modelInfo: forward, sourceMedia: sources })).toEqual(
      resolveGenerationMode({ modelInfo: reversed, sourceMedia: sources }),
    );
  });
});
