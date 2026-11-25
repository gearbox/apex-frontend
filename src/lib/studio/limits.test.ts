import { describe, expect, it } from 'vitest';
import { STUDIO_LIMITS } from './limits';

describe('studio contract limits', () => {
  it.each([
    ['projectName', 100],
    ['concept', 8000],
    ['trackTitle', 200],
    ['tracksPerProject', 64],
    ['artistName', 100],
    ['artistsPerUser', 50],
    ['persona', 4000],
    ['voiceNotes', 2000],
    ['memoryTitle', 120],
    ['memoryBody', 2000],
    ['styleTags', { items: 40, length: 60 }],
    ['globalAvoid', { items: 40, length: 60 }],
    ['aestheticReferences', { items: 20, length: 200 }],
    ['themes', { items: 12, length: 60 }],
    ['imagery', { items: 20, length: 120 }],
  ] as const)('pins %s', (field, limit) => {
    expect(STUDIO_LIMITS[field]).toEqual(limit);
  });
});
