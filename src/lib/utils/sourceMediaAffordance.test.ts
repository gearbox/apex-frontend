import { describe, expect, it } from 'vitest';
import {
  appendableMediaKinds,
  broadMaxSourceCount,
  isSourceDraftAmbiguous,
  isSourceDraftIncompatible,
  isSourceSectionVisible,
  replacementMediaKinds,
  sourceConsumingMediaKinds,
} from './sourceMediaAffordance';
import type { ResolverSource } from './generationModeResolver';
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

function image(assetRef: string): ResolverSource {
  return { assetRef, mediaType: 'image', available: true };
}

function video(assetRef: string): ResolverSource {
  return { assetRef, mediaType: 'video', available: true };
}

describe('isSourceSectionVisible', () => {
  it('1. hides for a t2i-only model with an empty draft', () => {
    expect(isSourceSectionVisible(makeAishaImageLiteModelInfo(), [])).toBe(false);
  });

  it('2. shows for a t2i-only model with a retained draft', () => {
    const draft = [
      { assetRef: 'upload:1', mediaType: 'image', previewUrl: null, label: null, available: true },
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

  it('11. Aisha Video empty draft -> image allowed', () => {
    expect(appendableMediaKinds(makeAishaVideoModelInfo(), [])).toEqual(['image']);
  });

  it('12. Aisha Video one image -> second image allowed under the current unique FLF2V contract', () => {
    expect(appendableMediaKinds(makeAishaVideoModelInfo(), [image('upload:1')])).toEqual(['image']);
  });

  it('13. Aisha Video two images -> no third source', () => {
    expect(
      appendableMediaKinds(makeAishaVideoModelInfo(), [image('upload:1'), image('upload:2')]),
    ).toEqual([]);
  });
});

describe('appendableMediaKinds — mandatory ambiguity protection (synthetic future contract)', () => {
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

  it('14-15. a generic second image would be ambiguous (complete i2v + complete flf2v) -> not offered', () => {
    const modelInfo = makeModelInfo({ generation_modes: syntheticModes });
    expect(appendableMediaKinds(modelInfo, [image('upload:1')])).toEqual([]);
  });

  it('16. is unaffected by advertised key order', () => {
    const forward = makeModelInfo({ generation_modes: syntheticModes });
    const reversed = makeModelInfo({ generation_modes: reversedModes });
    expect(appendableMediaKinds(forward, [image('upload:1')])).toEqual(
      appendableMediaKinds(reversed, [image('upload:1')]),
    );
  });
});

describe('replacementMediaKinds', () => {
  it('17-18. a max-capacity source list can still replace an unavailable source (computed by replacement simulation)', () => {
    const modelInfo = makeAishaImageModelInfo(); // i2i: exactly 1 image
    const draft: ResolverSource[] = [
      { assetRef: 'output:missing', mediaType: null, available: false },
    ];
    // Append is unavailable at capacity (mediaType null can't append at all)...
    expect(appendableMediaKinds(modelInfo, draft)).toEqual([]);
    // ...but replacement at the existing index recovers it.
    expect(replacementMediaKinds(modelInfo, draft, 0)).toEqual(['image']);
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

  it('flags an ambiguous draft', () => {
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
    expect(isSourceDraftAmbiguous(modelInfo, [image('upload:1'), image('upload:2')])).toBe(true);
    expect(isSourceDraftIncompatible(modelInfo, [image('upload:1'), image('upload:2')])).toBe(
      false,
    );
  });
});
