import type { components } from '$lib/api/types';
import { KNOWN_ASPECT_RATIOS } from '$lib/utils/modelCapabilities';

export const AISHA_IMAGE_CONSTRAINTS: components['schemas']['ImageConstraints'] = {
  min_height: 256,
  max_height: 2048,
  default_height: 1024,
  output_resolutions: null,
  supported_tiers: ['draft', 'standard', 'high', 'ultra'],
  default_tier: 'standard',
  tier_megapixels: { draft: 0.25, standard: 1.0, high: 2.0, ultra: 4.0 },
  edit_aspect_ratios: [...KNOWN_ASPECT_RATIOS],
};

/**
 * Aisha Image Lite is t2i-only and does not advertise an i2i/edit mode at
 * all, so it cannot reshape on edit — `edit_aspect_ratios: []` mirrors that,
 * same as Grok's contract-accurate empty list. Everything else about the
 * underlying image pipeline (height bounds, tiers) matches full Aisha Image.
 */
export const AISHA_IMAGE_LITE_CONSTRAINTS: components['schemas']['ImageConstraints'] = {
  ...AISHA_IMAGE_CONSTRAINTS,
  edit_aspect_ratios: [],
};
