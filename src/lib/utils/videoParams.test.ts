import { describe, expect, it } from 'vitest';
import { makeModelInfo } from '../../mocks/factories/providers';
import { getVideoConstraints, normalizeVideoParams } from './videoParams';

describe('video parameters', () => {
  const constrainedVideoModel = makeModelInfo({
    capabilities: ['t2v'],
    image: null,
    video: { max_duration: 4, resolutions: ['480p'] },
  });

  it('uses live model constraints when they are available', () => {
    expect(getVideoConstraints(constrainedVideoModel)).toEqual({
      maxDuration: 4,
      resolutions: ['480p'],
    });
  });

  it('normalizes stale duration and resolution to live model constraints', () => {
    expect(normalizeVideoParams(constrainedVideoModel, 12, '720p')).toEqual({
      duration: 4,
      resolution: '480p',
    });
  });
});
