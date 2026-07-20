import type { components } from '$lib/api/types';

type MediaObject = components['schemas']['MediaObject'];
type ImageVariant = components['schemas']['ImageVariant'];

/* ─── MediaObject factories ─── */

export function makeImageVariant(overrides: Partial<ImageVariant> = {}): ImageVariant {
  return {
    label: 'sm',
    width: 150,
    height: 150,
    url: '/v1/content/outputs/variant_sm_001',
    ...overrides,
  };
}

/** original + standard sm(150)/md(512) WEBP variants for a given base id */
export function makeStandardImageMedia(
  baseId: string,
  overrides: Partial<MediaObject> = {},
): MediaObject {
  const base = `/v1/content/outputs/${baseId}`;
  return {
    media_type: 'image',
    original: {
      url: base,
      width: 1024,
      height: 1024,
      content_type: 'image/png',
      size_bytes: 102400,
    },
    variants: [
      makeImageVariant({ label: 'sm', width: 150, height: 150, url: `${base}_sm` }),
      makeImageVariant({ label: 'md', width: 512, height: 512, url: `${base}_md` }),
    ],
    ...overrides,
  };
}

export function makeMediaObject(overrides: Partial<MediaObject> = {}): MediaObject {
  return makeStandardImageMedia('out_mock_001', overrides);
}

export function makeVideoMediaObject(overrides: Partial<MediaObject> = {}): MediaObject {
  return {
    media_type: 'video',
    original: {
      url: '/v1/content/outputs/vid_mock_001',
      width: null,
      height: null,
      content_type: 'video/mp4',
      size_bytes: 5000000,
    },
    variants: [
      makeImageVariant({
        label: 'sm',
        width: 150,
        height: 84,
        url: '/v1/content/outputs/vid_mock_001_poster_sm',
      }),
      makeImageVariant({
        label: 'md',
        width: 512,
        height: 288,
        url: '/v1/content/outputs/vid_mock_001_poster_md',
      }),
    ],
    ...overrides,
  };
}

/** MediaObject with no variants — tests legacy/empty-variant rendering */
export function makeEmptyVariantsMediaObject(): MediaObject {
  return {
    ...makeStandardImageMedia('out_legacy_001', {
      original: {
        url: '/v1/content/outputs/out_legacy_001',
        width: 800,
        height: 600,
        content_type: 'image/jpeg',
        size_bytes: 50000,
      },
    }),
    variants: [],
  };
}
