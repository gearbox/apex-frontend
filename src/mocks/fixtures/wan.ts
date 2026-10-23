import { makeModelInfo } from '../factories/providers';
import type { components } from '$lib/api/types';

/** Discovery fixture from gearbox/apex/docs/contracts/wan-video-contract.md §1. */
export function makeWanModelInfo(
  overrides: Partial<components['schemas']['ModelInfo']> = {},
): components['schemas']['ModelInfo'] {
  return makeModelInfo({
    model_key: 'wan3.0-video',
    name: 'Wan 3.0',
    max_images: 1,
    max_prompt_length: 4096,
    supports_negative_prompt: false,
    unsupported_parameters: [],
    image: null,
    aspect_ratios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
    generation_modes: {
      t2v: { source_media: null },
      i2v: { source_media: { min: 1, max: 1, media_types: ['image'], roles: ['first_frame'] } },
      v2v: { source_media: { min: 1, max: 1, media_types: ['video'], roles: null } },
      flf2v: {
        source_media: {
          min: 2,
          max: 2,
          media_types: ['image'],
          roles: ['first_frame', 'last_frame'],
        },
      },
      r2v: { source_media: { min: 1, max: 8, media_types: ['image'], roles: null } },
    },
    video: {
      bills_input_video_seconds: true,
      min_duration: 2,
      max_duration: 30,
      resolutions: ['480p', '720p', '1080p'],
      supported_parameters: ['audio', 'prompt_extend'],
      input_video: {
        formats: ['mov', 'mp4'],
        min_duration_ms: 1000,
        max_duration_ms: 15000,
        max_bytes: 100000000,
      },
      input_image: { formats: ['jpeg', 'png', 'webp'], max_bytes: 20000000 },
      max_combined_duration: 30,
      input_anchored_modes: ['flf2v', 'i2v', 'v2v'],
    },
    seed_range: { min: 0, max: 2147483647 },
    ...overrides,
  });
}
