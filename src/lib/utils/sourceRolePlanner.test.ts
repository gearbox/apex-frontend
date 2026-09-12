import { describe, expect, it } from 'vitest';
import { planRoleSelection } from './sourceRolePlanner';
import type { SourceMediaDraft } from '$lib/stores/generation';
import { makeAishaVideoModelInfo, makeModelInfo } from '../../mocks/factories/providers';
import type { components } from '$lib/api/types';

type GenerationModeInfo = components['schemas']['GenerationModeInfo'];
type MediaSlot = components['schemas']['MediaSlot'];

function source(
  assetRef: string,
  mediaType: string,
  role: MediaSlot | null = null,
): SourceMediaDraft {
  return { assetRef, mediaType, previewUrl: null, label: null, available: true, role };
}

describe('planRoleSelection — Aisha Video contract', () => {
  it('empty draft + choose first_frame -> append with no promotion', () => {
    const plan = planRoleSelection(makeAishaVideoModelInfo(), [], 'first_frame');
    expect(plan).toEqual({ allowed: true, promote: [], role: 'first_frame' });
  });

  it('empty draft + choose last_frame -> append with no promotion', () => {
    const plan = planRoleSelection(makeAishaVideoModelInfo(), [], 'last_frame');
    expect(plan).toEqual({ allowed: true, promote: [], role: 'last_frame' });
  });

  it('generic image A + choose last_frame B -> promotes A to first_frame, appends B as last_frame', () => {
    const sources = [source('upload:A', 'image')];
    const plan = planRoleSelection(makeAishaVideoModelInfo(), sources, 'last_frame');
    expect(plan).toEqual({
      allowed: true,
      promote: [{ index: 0, role: 'first_frame' }],
      role: 'last_frame',
    });
  });

  it('first_frame A + choose last_frame B -> preserves A, appends B with no promotion', () => {
    const sources = [source('upload:A', 'image', 'first_frame')];
    const plan = planRoleSelection(makeAishaVideoModelInfo(), sources, 'last_frame');
    expect(plan).toEqual({ allowed: true, promote: [], role: 'last_frame' });
  });

  it('last_frame B + choose first_frame A -> preserves B, appends A with no promotion', () => {
    const sources = [source('upload:B', 'image', 'last_frame')];
    const plan = planRoleSelection(makeAishaVideoModelInfo(), sources, 'first_frame');
    expect(plan).toEqual({ allowed: true, promote: [], role: 'first_frame' });
  });

  it('an occupied last_frame + choosing last_frame again is a replacement, not a duplicate append', () => {
    const sources = [source('upload:X', 'image', 'last_frame')];
    const plan = planRoleSelection(makeAishaVideoModelInfo(), sources, 'last_frame');
    expect(plan).toEqual({ allowed: false, reason: 'occupied' });
  });

  it('a full first_frame + last_frame draft refuses another first_frame append as occupied', () => {
    const sources = [
      source('upload:A', 'image', 'first_frame'),
      source('upload:B', 'image', 'last_frame'),
    ];
    expect(planRoleSelection(makeAishaVideoModelInfo(), sources, 'first_frame')).toEqual({
      allowed: false,
      reason: 'occupied',
    });
  });

  it('a video generic source cannot be promoted to an image-only role — incompatible', () => {
    const sources = [source('upload:V', 'video')];
    const plan = planRoleSelection(makeAishaVideoModelInfo(), sources, 'last_frame');
    expect(plan).toEqual({ allowed: false, reason: 'incompatible' });
  });

  it('is key-order invariant', () => {
    const forwardModes: Record<string, GenerationModeInfo> = {
      i2v: { source_media: { min: 1, max: 1, media_types: ['image'], roles: ['first_frame'] } },
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
      flf2v: forwardModes.flf2v,
      i2v: forwardModes.i2v,
    };
    const sources = [source('upload:A', 'image')];
    const forward = planRoleSelection(
      makeModelInfo({ generation_modes: forwardModes }),
      sources,
      'last_frame',
    );
    const reversed = planRoleSelection(
      makeModelInfo({ generation_modes: reversedModes }),
      sources,
      'last_frame',
    );
    expect(forward).toEqual(reversed);
  });
});

describe('planRoleSelection — ambiguous promotion', () => {
  it('refuses to guess when two different role assignments are both legal', () => {
    // Two candidate modes both need `first_frame` (the requested role) plus a
    // second role — but they disagree on what that second role is, so the
    // single free generic source has two materially different legal homes.
    const modes: Record<string, GenerationModeInfo> = {
      'mode-a': {
        source_media: {
          min: 2,
          max: 2,
          media_types: ['image'],
          roles: ['reference', 'first_frame'],
        },
      },
      'mode-b': {
        source_media: {
          min: 2,
          max: 2,
          media_types: ['image'],
          roles: ['first_frame', 'last_frame'],
        },
      },
    };
    const modelInfo = makeModelInfo({ generation_modes: modes });
    const sources = [source('upload:A', 'image')];
    const plan = planRoleSelection(modelInfo, sources, 'first_frame');
    expect(plan).toEqual({ allowed: false, reason: 'ambiguous' });
  });

  it('refuses when two free sources could fill the same remaining role interchangeably', () => {
    const modes: Record<string, GenerationModeInfo> = {
      triple: {
        source_media: {
          min: 3,
          max: 3,
          media_types: ['image'],
          roles: ['reference', 'first_frame', 'last_frame'],
        },
      },
    };
    const modelInfo = makeModelInfo({ generation_modes: modes });
    // Two generic images could each become either `first_frame` or `last_frame`.
    const sources = [source('upload:A', 'image'), source('upload:B', 'image')];
    const plan = planRoleSelection(modelInfo, sources, 'reference');
    expect(plan).toEqual({ allowed: false, reason: 'ambiguous' });
  });

  it('fails closed per mode: a mode with an unknown companion role is never a candidate, even for its known role', () => {
    const modes: Record<string, GenerationModeInfo> = {
      flf2v: {
        source_media: {
          min: 2,
          max: 2,
          media_types: ['image'],
          roles: ['first_frame', 'future_magic_slot'] as never,
        },
      },
    };
    const modelInfo = makeModelInfo({ generation_modes: modes });
    const plan = planRoleSelection(modelInfo, [], 'first_frame');
    expect(plan).toEqual({ allowed: false, reason: 'incompatible' });
  });

  it('does not drop a free source that cannot fit any remaining role', () => {
    const modes: Record<string, GenerationModeInfo> = {
      pair: {
        source_media: {
          min: 2,
          max: 2,
          media_types: ['image'],
          roles: ['reference', 'first_frame'],
        },
      },
    };
    const modelInfo = makeModelInfo({ generation_modes: modes });
    // Two free generic sources but only one remaining role slot after the
    // requested role is claimed — no legal placement exists for both.
    const sources = [source('upload:A', 'image'), source('upload:B', 'image')];
    const plan = planRoleSelection(modelInfo, sources, 'first_frame');
    expect(plan).toEqual({ allowed: false, reason: 'incompatible' });
  });
});
