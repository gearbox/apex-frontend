import * as m from '$paraglide/messages';
import type { components } from '$lib/api/types';
import type { ModelGuide } from './types';

type ModelType = components['schemas']['ModelType'];

export const modelGuides: Record<ModelType, ModelGuide> = {
  'grok-imagine-image': {
    modelKey: 'grok-imagine-image',
    tagline: m.model_guide_grok_imagine_image_tagline,
    goodAt: [
      m.model_guide_grok_imagine_image_good_at_1,
      m.model_guide_grok_imagine_image_good_at_2,
    ],
    chooseWhen: [
      m.model_guide_grok_imagine_image_choose_when_1,
      m.model_guide_grok_imagine_image_choose_when_2,
    ],
    restrictions: [
      m.model_guide_grok_imagine_image_restrictions_1,
      m.model_guide_grok_imagine_image_restrictions_2,
    ],
    billingRules: [
      m.model_guide_grok_imagine_image_billing_1,
      m.model_guide_grok_imagine_image_billing_2,
    ],
    promptTips: [m.model_guide_grok_imagine_image_tips_1, m.model_guide_grok_imagine_image_tips_2],
    examples: [
      {
        prompt:
          'A ceramic coffee mug on a wooden windowsill, soft morning light, shallow depth of field',
        mode: 't2i',
        aspectRatio: '1:1',
        image: '/model-guides/grok-imagine-image/gi-mug.webp',
      },
      {
        prompt: 'Portrait of an elderly fisherman mending a net, overcast harbour, natural light',
        mode: 't2i',
        aspectRatio: '9:16',
        image: '/model-guides/grok-imagine-image/gi-fisher.webp',
      },
      {
        prompt: 'Wide shot of a mountain road at dusk, low fog, headlights approaching',
        mode: 't2i',
        aspectRatio: '16:9',
        image: '/model-guides/grok-imagine-image/gi-road.webp',
      },
    ],
  },
  'grok-2-image-1212': {
    modelKey: 'grok-2-image-1212',
    tagline: m.model_guide_grok_2_image_1212_tagline,
    goodAt: [m.model_guide_grok_2_image_1212_good_at_1, m.model_guide_grok_2_image_1212_good_at_2],
    chooseWhen: [
      m.model_guide_grok_2_image_1212_choose_when_1,
      m.model_guide_grok_2_image_1212_choose_when_2,
    ],
    restrictions: [
      m.model_guide_grok_2_image_1212_restrictions_1,
      m.model_guide_grok_2_image_1212_restrictions_2,
    ],
    billingRules: [
      m.model_guide_grok_2_image_1212_billing_1,
      m.model_guide_grok_2_image_1212_billing_2,
    ],
    promptTips: [m.model_guide_grok_2_image_1212_tips_1, m.model_guide_grok_2_image_1212_tips_2],
    examples: [
      {
        prompt:
          'A cluttered watchmaker workshop: brass tools on the left, an open pocket watch in the centre, a cat asleep on the right',
        mode: 't2i',
        aspectRatio: '16:9',
      },
      {
        prompt:
          'Flat vector illustration of a harbour town, three fishing boats, red roofs, a single sailing gull',
        mode: 't2i',
        aspectRatio: '1:1',
      },
      {
        prompt:
          'A red mountain train crossing a stone bridge, waterfall below, pine forest behind, small station on the far right',
        mode: 't2i',
        aspectRatio: '16:9',
      },
    ],
  },
  'grok-imagine-video': {
    modelKey: 'grok-imagine-video',
    tagline: m.model_guide_grok_imagine_video_tagline,
    goodAt: [
      m.model_guide_grok_imagine_video_good_at_1,
      m.model_guide_grok_imagine_video_good_at_2,
    ],
    chooseWhen: [
      m.model_guide_grok_imagine_video_choose_when_1,
      m.model_guide_grok_imagine_video_choose_when_2,
    ],
    restrictions: [
      m.model_guide_grok_imagine_video_restrictions_1,
      m.model_guide_grok_imagine_video_restrictions_2,
    ],
    billingRules: [
      m.model_guide_grok_imagine_video_billing_1,
      m.model_guide_grok_imagine_video_billing_2,
    ],
    promptTips: [m.model_guide_grok_imagine_video_tips_1, m.model_guide_grok_imagine_video_tips_2],
    examples: [
      {
        prompt:
          'A cyclist rides through an empty city street at sunrise, camera tracking smoothly from the side',
        mode: 't2v',
        aspectRatio: '16:9',
      },
      {
        prompt:
          'Rain rolls across a quiet cafe window at night while warm lights flicker softly inside',
        mode: 't2v',
        aspectRatio: '9:16',
      },
      {
        prompt:
          'A night train passes through a snowy station, steam drifting across the platform under yellow lamps',
        mode: 't2v',
        aspectRatio: '16:9',
      },
    ],
  },
  'aisha-image': {
    modelKey: 'aisha-image',
    tagline: m.model_guide_aisha_image_tagline,
    goodAt: [m.model_guide_aisha_image_good_at_1, m.model_guide_aisha_image_good_at_2],
    chooseWhen: [m.model_guide_aisha_image_choose_when_1, m.model_guide_aisha_image_choose_when_2],
    restrictions: [m.model_guide_aisha_image_restrictions_1],
    billingRules: [m.model_guide_aisha_image_billing_1, m.model_guide_aisha_image_billing_2],
    promptTips: [m.model_guide_aisha_image_tips_1, m.model_guide_aisha_image_tips_2],
    examples: [
      {
        prompt:
          'Studio product shot of a matte black bottle on grey seamless paper, softbox lighting',
        mode: 't2i',
        aspectRatio: '4:3',
      },
      {
        prompt: 'Oil painting of a winter orchard, bare branches, long blue shadows across snow',
        mode: 't2i',
        aspectRatio: '3:4',
      },
      {
        prompt:
          'Minimal interior photograph of a single paper lamp beside a dark wooden chair, warm evening light',
        mode: 't2i',
        aspectRatio: '3:4',
      },
    ],
  },
  'aisha-video': {
    modelKey: 'aisha-video',
    tagline: m.model_guide_aisha_video_tagline,
    goodAt: [m.model_guide_aisha_video_good_at_1, m.model_guide_aisha_video_good_at_2],
    chooseWhen: [m.model_guide_aisha_video_choose_when_1, m.model_guide_aisha_video_choose_when_2],
    restrictions: [m.model_guide_aisha_video_restrictions_1],
    billingRules: [m.model_guide_aisha_video_billing_1, m.model_guide_aisha_video_billing_2],
    promptTips: [m.model_guide_aisha_video_tips_1, m.model_guide_aisha_video_tips_2],
    examples: [
      {
        prompt:
          'Close-up of translucent fabric moving slowly in a dark studio, narrow rim light, gentle camera drift',
        mode: 't2v',
        aspectRatio: '9:16',
      },
      {
        prompt:
          'Low camera moving through a misty pine forest at dawn, sunbeams appearing between the trees',
        mode: 't2v',
        aspectRatio: '16:9',
      },
      {
        prompt:
          'Slow aerial movement above a quiet old city after rain, wet rooftops reflecting the blue evening sky',
        mode: 't2v',
        aspectRatio: '16:9',
      },
    ],
  },
};
