import type { components } from '$lib/api/types';

export const AISHA_IMAGE_CONSTRAINTS: components['schemas']['ImageConstraints'] = {
  min_height: 256,
  max_height: 2048,
  default_height: 1024,
  output_resolutions: null,
  supported_tiers: ['draft', 'standard', 'high', 'ultra'],
  default_tier: 'standard',
  tier_megapixels: { draft: 0.25, standard: 1.0, high: 2.0, ultra: 4.0 },
  edit_aspect_ratios: ['2:3', '3:2', '1:1', '9:16', '16:9', '3:4', '4:3'],
};
