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

function image(
  assetRef: string,
  opts: { available?: boolean; role?: ResolverSource['role'] } = {},
): ResolverSource {
  return {
    assetRef,
    mediaType: 'image',
    available: opts.available ?? true,
    role: opts.role ?? null,
  };
}

function video(
  assetRef: string,
  opts: { available?: boolean; role?: ResolverSource['role'] } = {},
): ResolverSource {
  return {
    assetRef,
    mediaType: 'video',
    available: opts.available ?? true,
    role: opts.role ?? null,
  };
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

  it('keeps an explicit FLF2V preference incomplete with only one of two required role-tagged images', () => {
    const modelInfo = makeAishaVideoModelInfo(); // flf2v: min 2, max 2, [first_frame, last_frame]
    expect(
      resolveGenerationMode({
        modelInfo,
        sourceMedia: [image('upload:1', { role: 'first_frame' })],
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
  it('recomputes purely from the new contract for the same generic source, without mutating it', () => {
    const source: ResolverSource[] = [image('upload:1')];
    const modelA = makeGrokImageModelInfo(); // i2i accepts 1 generic image
    const modelC = makeGrokVideoModelInfo({
      generation_modes: generationModes(['t2v', 'v2v']), // no image-accepting mode
    });

    expect(resolveGenerationMode({ modelInfo: modelA, sourceMedia: source })).toMatchObject({
      status: 'resolved',
      mode: 'i2i',
    });
    expect(resolveGenerationMode({ modelInfo: modelC, sourceMedia: source }).status).toBe(
      'invalid',
    );
    expect(source).toEqual([image('upload:1')]);
  });

  it('a retained generic source becomes incompatible after switching to a model whose only accepting mode is positional', () => {
    // Phase 4: switching from a roles:null model to Aisha Video must never
    // silently reinterpret a generic source as `first_frame` — the draft
    // stays incompatible until the user explicitly re-assigns or replaces it.
    const source: ResolverSource[] = [image('upload:1')];
    const aishaVideo = makeAishaVideoModelInfo();
    expect(resolveGenerationMode({ modelInfo: aishaVideo, sourceMedia: source }).status).toBe(
      'invalid',
    );
  });

  it('the same asset resolves i2v once explicitly re-assigned the first_frame role for the new model', () => {
    const roleTagged: ResolverSource[] = [image('upload:1', { role: 'first_frame' })];
    const aishaVideo = makeAishaVideoModelInfo();
    expect(resolveGenerationMode({ modelInfo: aishaVideo, sourceMedia: roleTagged })).toMatchObject(
      { status: 'resolved', mode: 'i2v' },
    );
  });
});

describe('resolveGenerationMode — Phase 4 mandatory ambiguity regression: generic I2V vs positional FLF2V', () => {
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

  it('one generic image cleanly resolves i2v — flf2v is incompatible, not incomplete, without a role', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] });
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
    expect(result.completeCandidates).toEqual(['i2v']);
    expect(result.incompleteCandidates).toEqual([]);
  });

  it('a second generic image ("Add reference") still cleanly resolves i2v — no source-count ambiguity', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
    });
    // Cardinality alone must never manufacture ambiguity: with both sources
    // still generic, flf2v never becomes a candidate at all (it requires a
    // role each source doesn't have) — i2v resolves uniquely.
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
    expect(result.completeCandidates).toEqual(['i2v']);
  });

  it('resolves flf2v once both sources carry their positional roles ("Add end frame")', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [
        image('upload:1', { role: 'first_frame' }),
        image('upload:2', { role: 'last_frame' }),
      ],
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'flf2v' });
    expect(result.completeCandidates).toEqual(['flf2v']);
  });

  it('a lone first_frame role resolves incomplete flf2v — the roleless i2v candidate rejects it', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1', { role: 'first_frame' })],
    });
    expect(result).toMatchObject({ status: 'incomplete', mode: 'flf2v' });
    expect(result.completeCandidates).toEqual([]);
  });

  it('a generic source does not silently satisfy the positional flf2v candidate', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2', { role: 'last_frame' })],
    });
    // flf2v rejects the mixed selection (one source has no role); i2v rejects
    // it too (one source is role-tagged). Nothing satisfies either candidate.
    expect(result.status).toBe('invalid');
  });

  it('a preferred mode is preserved as a resolved tie-break even though it is no longer strictly needed for count-only ambiguity', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1'), image('upload:2')],
      preferredMode: 'i2v',
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
  });

  it('resolution is unaffected by advertised key order, for both the generic and the positional case', () => {
    const forward = makeModelInfo({ generation_modes: syntheticModes });
    const reversed = makeModelInfo({ generation_modes: reversedModes });
    const generic = [image('upload:1'), image('upload:2')];
    const positional = [
      image('upload:1', { role: 'first_frame' }),
      image('upload:2', { role: 'last_frame' }),
    ];

    expect(resolveGenerationMode({ modelInfo: forward, sourceMedia: generic })).toEqual(
      resolveGenerationMode({ modelInfo: reversed, sourceMedia: generic }),
    );
    expect(resolveGenerationMode({ modelInfo: forward, sourceMedia: positional })).toEqual(
      resolveGenerationMode({ modelInfo: reversed, sourceMedia: positional }),
    );
  });
});

describe('resolveGenerationMode — genuine positional ambiguity (two roleful candidates)', () => {
  // A deliberately synthetic pair of modes sharing the same single role: real
  // registry vocabulary never advertises two candidates this way, but the
  // resolver must still refuse to guess between them by key order.
  const syntheticModes: Record<string, GenerationModeInfo> = {
    'edit-a': { source_media: { min: 1, max: 1, media_types: ['image'], roles: ['reference'] } },
    'edit-b': { source_media: { min: 1, max: 1, media_types: ['image'], roles: ['reference'] } },
  };
  const reversedModes: Record<string, GenerationModeInfo> = {
    'edit-b': syntheticModes['edit-b'],
    'edit-a': syntheticModes['edit-a'],
  };

  it('is ambiguous when two roleful candidates both accept the same role assignment', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1', { role: 'reference' })],
    });
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') expect(result.candidates).toEqual(['edit-a', 'edit-b']);
  });

  it('is unaffected by advertised key order', () => {
    const forward = makeModelInfo({ generation_modes: syntheticModes });
    const reversed = makeModelInfo({ generation_modes: reversedModes });
    const sources = [image('upload:1', { role: 'reference' })];

    expect(resolveGenerationMode({ modelInfo: forward, sourceMedia: sources })).toEqual(
      resolveGenerationMode({ modelInfo: reversed, sourceMedia: sources }),
    );
  });

  it('a preferred mode breaks the tie explicitly', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1', { role: 'reference' })],
      preferredMode: 'edit-b',
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'edit-b' });
  });
});

describe('resolveGenerationMode — duplicate roles and wrong role media kind', () => {
  it('rejects two sources claiming the same role', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [
        image('upload:1', { role: 'first_frame' }),
        image('upload:2', { role: 'first_frame' }),
      ],
    });
    expect(result.status).toBe('invalid');
  });

  it('rejects a role assigned to a source of the wrong media kind', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [video('upload:1', { role: 'last_frame' })],
    });
    expect(result.status).toBe('invalid');
  });

  it('fails closed on an unrecognized future role name rather than guessing its media kind', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [
        {
          assetRef: 'upload:1',
          mediaType: 'image',
          available: true,
          role: 'middle_frame' as never,
        },
      ],
    });
    expect(result.status).toBe('invalid');
  });

  it('fails closed when the provider contract itself advertises an unrecognized role', () => {
    const modelInfo = makeModelInfo({
      generation_modes: {
        'future-edit': {
          source_media: {
            min: 1,
            max: 1,
            media_types: ['image'],
            roles: ['future_magic_slot'] as never,
          },
        },
      },
    });

    expect(resolveGenerationMode({ modelInfo, sourceMedia: [image('upload:1')] }).status).toBe(
      'invalid',
    );
  });
});

describe('resolveGenerationMode — direct Aisha Video regression (Phase 3 cleanup P3.3)', () => {
  it('no source resolves t2v', () => {
    const modelInfo = makeAishaVideoModelInfo();
    expect(resolveGenerationMode({ modelInfo, sourceMedia: [] })).toMatchObject({
      status: 'resolved',
      mode: 't2v',
    });
  });

  it('a role-tagged first_frame image resolves i2v', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1', { role: 'first_frame' })],
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'i2v' });
    expect(result.incompleteCandidates).toEqual(['flf2v']);
  });

  it('a lone role-tagged last_frame image is an incomplete flf2v draft', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [image('upload:1', { role: 'last_frame' })],
    });
    expect(result).toMatchObject({ status: 'incomplete', mode: 'flf2v' });
  });

  it('first_frame + last_frame role-tagged images resolve flf2v', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [
        image('upload:1', { role: 'first_frame' }),
        image('upload:2', { role: 'last_frame' }),
      ],
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'flf2v' });
  });

  it('last_frame + first_frame in reverse selection order still resolves flf2v with roles intact', () => {
    const modelInfo = makeAishaVideoModelInfo();
    const result = resolveGenerationMode({
      modelInfo,
      sourceMedia: [
        image('upload:2', { role: 'last_frame' }),
        image('upload:1', { role: 'first_frame' }),
      ],
    });
    expect(result).toMatchObject({ status: 'resolved', mode: 'flf2v' });
  });
});
