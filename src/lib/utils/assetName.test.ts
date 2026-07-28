import { describe, expect, it } from 'vitest';
import { assetFilename, assetLabel } from './assetName';

const canonicalFilename = (extension: string) =>
  `550e8400-e29b-41d4-a716-446655440000.${extension}`;

describe('assetFilename', () => {
  it('prefers display_filename over original_filename', () => {
    expect(
      assetFilename({
        display_title: null,
        display_filename: 'holiday.png',
        original_filename: canonicalFilename('png'),
      }),
    ).toBe('holiday.png');
  });

  it('falls back to original_filename for legacy uploads', () => {
    expect(
      assetFilename({
        display_title: null,
        display_filename: null,
        original_filename: 'holiday.png',
      }),
    ).toBe('holiday.png');
  });

  it.each(['png', 'jpeg', 'webp', 'mp4', 'webm'])(
    'suppresses canonical UUID filenames with a .%s extension',
    (extension) => {
      expect(
        assetFilename({
          display_title: null,
          display_filename: null,
          original_filename: canonicalFilename(extension),
        }),
      ).toBeNull();
    },
  );

  it('returns null for generated output with no filename', () => {
    expect(
      assetFilename({ display_title: null, display_filename: null, original_filename: null }),
    ).toBeNull();
  });

  it('does not suppress a human filename that only contains a UUID', () => {
    expect(
      assetFilename({
        display_title: null,
        display_filename: null,
        original_filename: `scan-${canonicalFilename('png')}`,
      }),
    ).toBe(`scan-${canonicalFilename('png')}`);
  });
});

describe('assetLabel', () => {
  it('prefers a user-set title, then the filename, then the fallback', () => {
    expect(
      assetLabel(
        {
          display_title: 'Summer trip',
          display_filename: 'holiday.png',
          original_filename: canonicalFilename('png'),
        },
        'Untitled',
      ),
    ).toBe('Summer trip');
    expect(
      assetLabel(
        {
          display_title: null,
          display_filename: 'holiday.png',
          original_filename: canonicalFilename('png'),
        },
        'Untitled',
      ),
    ).toBe('holiday.png');
  });

  it('returns the fallback when the only candidate is canonical', () => {
    expect(
      assetLabel(
        {
          display_title: null,
          display_filename: null,
          original_filename: canonicalFilename('png'),
        },
        'Untitled',
      ),
    ).toBe('Untitled');
  });
});
