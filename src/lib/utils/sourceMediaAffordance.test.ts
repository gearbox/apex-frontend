import { describe, expect, it } from 'vitest';
import {
  appendableMediaKinds,
  broadMaxSourceCount,
  interchangeableSourceMedia,
  isSourceDraftAmbiguous,
  isSourceDraftIncompatible,
  isSourceSectionVisible,
  replacementMediaKinds,
  roleSlotsForModel,
  sourceConsumingMediaKinds,
  sourceIndexForRole,
} from './sourceMediaAffordance';
import type { ResolverSource } from './generationModeResolver';
import type { SourceMediaDraft } from '$lib/stores/generation';
import {
  makeAishaImageLiteModelInfo,
  makeAishaImageModelInfo,
  makeAishaVideoModelInfo,
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  makeModelInfo,
} from '../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type GenerationModeInfo = components['schemas']['GenerationModeInfo'];
type MediaSlot = components['schemas']['MediaSlot'];

function image(assetRef: string, role: MediaSlot | null = null): ResolverSource {
  return { assetRef, mediaType: 'image', available: true, role };
}

function video(assetRef: string, role: MediaSlot | null = null): ResolverSource {
  return { assetRef, mediaType: 'video', available: true, role };
}

function sourceDraft(source: ResolverSource, label: string | null = null): SourceMediaDraft {
  return {
    assetRef: source.assetRef,
    mediaType: source.mediaType,
    previewUrl: null,
    label,
    available: source.available,
    role: source.role,
  };
}

describe('isSourceSectionVisible', () => {
  it('1. hides for a t2i-only model with an empty draft', () => {
    expect(isSourceSectionVisible(makeAishaImageLiteModelInfo(), [])).toBe(false);
  });

  it('2. shows for a t2i-only model with a retained draft', () => {
    const draft = [
      {
        assetRef: 'upload:1',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: null,
      },
    ];
    expect(isSourceSectionVisible(makeAishaImageLiteModelInfo(), draft)).toBe(true);
  });

  it('3. shows for a model advertising t2i + i2i with an empty draft', () => {
    expect(isSourceSectionVisible(makeGrokImageModelInfo(), [])).toBe(true);
  });

  it('4. shows for a video model with an empty draft', () => {
    expect(isSourceSectionVisible(makeGrokVideoModelInfo(), [])).toBe(true);
  });
});

describe('appendableMediaKinds', () => {
  it('5. Grok Image empty draft -> image allowed', () => {
    expect(appendableMediaKinds(makeGrokImageModelInfo(), [])).toEqual(['image']);
  });

  it('6. Grok Image one image -> another image allowed up to max', () => {
    expect(appendableMediaKinds(makeGrokImageModelInfo(), [image('upload:1')])).toEqual(['image']);
  });

  it('7. Aisha Image one image -> no second image (i2i caps at exactly 1)', () => {
    expect(appendableMediaKinds(makeAishaImageModelInfo(), [image('upload:1')])).toEqual([]);
  });

  it('8. Grok Video empty draft -> image and video both allowed', () => {
    expect(appendableMediaKinds(makeGrokVideoModelInfo(), [])).toEqual(['image', 'video']);
  });

  it('9. Grok Video one image -> no additional source', () => {
    expect(appendableMediaKinds(makeGrokVideoModelInfo(), [image('upload:1')])).toEqual([]);
  });

  it('10. Grok Video one video -> no additional source', () => {
    expect(appendableMediaKinds(makeGrokVideoModelInfo(), [video('upload:1')])).toEqual([]);
  });

  it('11. Aisha Video has no generic/interchangeable affordance at all — every source-accepting mode is positional', () => {
    // Phase 4: appendableMediaKinds is the *interchangeable* affordance only.
    // Aisha Video's i2v/flf2v both require named roles, so a plain generic
    // append can never satisfy either — the model is driven entirely by role
    // slots (see `roleSlotsForModel`), not this generic list affordance.
    expect(appendableMediaKinds(makeAishaVideoModelInfo(), [])).toEqual([]);
  });

  it('12. Aisha Video with one generic image still offers no generic append', () => {
    expect(appendableMediaKinds(makeAishaVideoModelInfo(), [image('upload:1')])).toEqual([]);
  });

  it('13. Aisha Video two images -> no third source', () => {
    expect(
      appendableMediaKinds(makeAishaVideoModelInfo(), [image('upload:1'), image('upload:2')]),
    ).toEqual([]);
  });
});

describe('appendableMediaKinds — synthetic mixed generic + positional contract', () => {
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

  it('14. a lone generic image still allows a generic append (resolves i2v, not ambiguous)', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    expect(appendableMediaKinds(modelInfo, [])).toEqual(['image']);
  });

  it('15. a second generic image ("Add reference") is offered too — flf2v never becomes a candidate without roles', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    expect(appendableMediaKinds(modelInfo, [image('upload:1')])).toEqual(['image']);
  });

  it('a role-tagged first_frame source has no generic append (i2v rejects a role-tagged selection)', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    expect(appendableMediaKinds(modelInfo, [image('upload:1', 'first_frame')])).toEqual([]);
  });

  it('16. is unaffected by advertised key order', () => {
    const forward = makeModelInfo({ generation_modes: syntheticModes });
    const reversed = makeModelInfo({ generation_modes: reversedModes });
    expect(appendableMediaKinds(forward, [image('upload:1')])).toEqual(
      appendableMediaKinds(reversed, [image('upload:1')]),
    );
  });
});

describe('roleSlotsForModel', () => {
  it('exposes first_frame and last_frame for Aisha Video, in display order, regardless of current sources', () => {
    const modelInfo = makeAishaVideoModelInfo();
    expect(roleSlotsForModel(modelInfo)).toEqual(['first_frame', 'last_frame']);
  });

  it('returns no slots for a purely roleless (Grok-shaped) model', () => {
    expect(roleSlotsForModel(makeGrokImageModelInfo())).toEqual([]);
    expect(roleSlotsForModel(makeGrokVideoModelInfo())).toEqual([]);
  });

  it('returns no slots for a model with no generation modes at all', () => {
    expect(roleSlotsForModel(null)).toEqual([]);
  });

  it('ignores an unknown runtime role instead of exposing a slot with guessed semantics', () => {
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
    expect(roleSlotsForModel(modelInfo)).toEqual([]);
  });

  it('fails closed per mode: ignores the entire partially-unknown mode, not merely its unknown role', () => {
    const modelInfo = makeModelInfo({
      generation_modes: {
        flf2v: {
          source_media: {
            min: 2,
            max: 2,
            media_types: ['image'],
            roles: ['first_frame', 'future_magic_slot'] as never,
          },
        },
      },
    });
    // first_frame must not leak through even though it is individually known —
    // its sibling role in the same mode is unknown, so the whole mode is unusable.
    expect(roleSlotsForModel(modelInfo)).toEqual([]);
  });

  it('still exposes a role through a separate, fully-known mode when another mode is partially unknown', () => {
    const modelInfo = makeModelInfo({
      generation_modes: {
        i2v: { source_media: { min: 1, max: 1, media_types: ['image'], roles: ['first_frame'] } },
        flf2v: {
          source_media: {
            min: 2,
            max: 2,
            media_types: ['image'],
            roles: ['first_frame', 'future_magic_slot'] as never,
          },
        },
      },
    });
    expect(roleSlotsForModel(modelInfo)).toEqual(['first_frame']);
  });
});

describe('sourceIndexForRole / interchangeableSourceMedia', () => {
  it('finds the occupying index for a filled role and null for an empty one', () => {
    const sources = [sourceDraft(image('upload:1', 'last_frame'))];
    expect(sourceIndexForRole(sources, 'last_frame')).toBe(0);
    expect(sourceIndexForRole(sources, 'first_frame')).toBeNull();
  });

  it('filters to only the generic/interchangeable sources, preserving order', () => {
    const sources = [
      sourceDraft(image('upload:1', 'first_frame')),
      sourceDraft(image('upload:2')),
      sourceDraft(image('upload:3', 'last_frame')),
      sourceDraft(image('upload:4')),
    ];
    expect(interchangeableSourceMedia(sources).map((s) => s.assetRef)).toEqual([
      'upload:2',
      'upload:4',
    ]);
  });
});

describe('replacementMediaKinds', () => {
  it('17-18. a max-capacity source list can still replace an unavailable source (computed by replacement simulation)', () => {
    const modelInfo = makeAishaImageModelInfo(); // i2i: exactly 1 image
    const draft: ResolverSource[] = [
      { assetRef: 'output:missing', mediaType: null, available: false, role: null },
    ];
    // Append is unavailable at capacity (mediaType null can't append at all)...
    expect(appendableMediaKinds(modelInfo, draft)).toEqual([]);
    // ...but replacement at the existing index recovers it.
    expect(replacementMediaKinds(modelInfo, draft, 0)).toEqual(['image']);
  });

  it('preserves an existing role assignment while simulating a replacement — never downgrades it to generic', () => {
    const modelInfo = makeAishaVideoModelInfo(); // flf2v: [first_frame, last_frame]
    const draft: ResolverSource[] = [
      image('upload:1', 'first_frame'),
      { assetRef: 'output:missing', mediaType: null, available: false, role: 'last_frame' },
    ];
    // The unavailable position keeps its `last_frame` role during simulation,
    // so a replacement image resolves flf2v rather than being rejected for
    // producing a generic + role-tagged mix.
    expect(replacementMediaKinds(modelInfo, draft, 1)).toEqual(['image']);
    // A video can never fill an image-only role, regardless of replacement.
    expect(replacementMediaKinds(modelInfo, draft, 1)).not.toContain('video');
  });

  it('19. invalid/ambiguous replacements are not offered', () => {
    const modelInfo = makeGrokVideoModelInfo(); // t2v / i2v(image) / v2v(video)
    const draft: ResolverSource[] = [image('upload:1'), video('upload:2')];
    // Two mixed sources already exceed every mode's contract — no replacement kind can fix either slot alone.
    expect(replacementMediaKinds(modelInfo, draft, 0)).toEqual([]);
    expect(replacementMediaKinds(modelInfo, draft, 1)).toEqual([]);
  });

  it('returns no kinds for an out-of-range index', () => {
    expect(replacementMediaKinds(makeGrokImageModelInfo(), [], 0)).toEqual([]);
  });
});

describe('sourceConsumingMediaKinds / broadMaxSourceCount', () => {
  it('collects the union of media kinds across all source-consuming modes', () => {
    expect(sourceConsumingMediaKinds(makeGrokVideoModelInfo())).toEqual(['image', 'video']);
    expect(sourceConsumingMediaKinds(makeAishaImageLiteModelInfo())).toEqual([]);
  });

  it('reports the largest max across advertised source-consuming modes, for display only', () => {
    expect(broadMaxSourceCount(makeGrokImageModelInfo())).toBe(4);
    expect(broadMaxSourceCount(makeAishaImageModelInfo())).toBe(1);
    expect(broadMaxSourceCount(makeAishaVideoModelInfo())).toBe(2);
    expect(broadMaxSourceCount(makeAishaImageLiteModelInfo())).toBe(0);
  });
});

describe('isSourceDraftIncompatible / isSourceDraftAmbiguous', () => {
  it('flags an incompatible non-empty draft after a model switch', () => {
    expect(isSourceDraftIncompatible(makeAishaImageLiteModelInfo(), [image('upload:1')])).toBe(
      true,
    );
  });

  it('never flags an empty draft as incompatible', () => {
    expect(isSourceDraftIncompatible(makeAishaImageLiteModelInfo(), [])).toBe(false);
  });

  it('does not flag a compatible draft as incompatible', () => {
    expect(isSourceDraftIncompatible(makeGrokImageModelInfo(), [image('upload:1')])).toBe(false);
  });

  it('two generic images against a mixed generic/positional model resolve cleanly — never ambiguous by count alone', () => {
    const modelInfo = makeModelInfo({
      generation_modes: {
        i2v: { source_media: { min: 1, max: 2, media_types: ['image'], roles: null } },
        flf2v: {
          source_media: {
            min: 2,
            max: 2,
            media_types: ['image'],
            roles: ['first_frame', 'last_frame'],
          },
        },
      },
    });
    expect(isSourceDraftAmbiguous(modelInfo, [image('upload:1'), image('upload:2')])).toBe(false);
    expect(isSourceDraftIncompatible(modelInfo, [image('upload:1'), image('upload:2')])).toBe(
      false,
    );
    // Explicit role assignment resolves the positional candidate instead.
    expect(
      isSourceDraftAmbiguous(modelInfo, [
        image('upload:1', 'first_frame'),
        image('upload:2', 'last_frame'),
      ]),
    ).toBe(false);
  });

  it('flags a genuinely ambiguous draft — two positional candidates accepting the same role', () => {
    const modelInfo = makeModelInfo({
      generation_modes: {
        'edit-a': {
          source_media: { min: 1, max: 1, media_types: ['image'], roles: ['reference'] },
        },
        'edit-b': {
          source_media: { min: 1, max: 1, media_types: ['image'], roles: ['reference'] },
        },
      },
    });
    expect(isSourceDraftAmbiguous(modelInfo, [image('upload:1', 'reference')])).toBe(true);
    expect(isSourceDraftIncompatible(modelInfo, [image('upload:1', 'reference')])).toBe(false);
  });
});
