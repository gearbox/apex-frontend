import { http, HttpResponse } from 'msw';
import { makeJobCreatedResponse, makeUnifiedJobResponse } from '../factories/job';
import { MOCK_BASE_URL as BASE } from '../config';
import { AISHA_IMAGE_CONSTRAINTS } from '../fixtures/aisha';

export const jobHandlers = [
  // Provider info — unified format
  http.get(`${BASE}/v1/providers`, () =>
    HttpResponse.json({
      providers: [
        {
          provider: 'grok',
          name: 'xAI Grok',
          available: true,
          provisioning_mode: 'always_on',
          models: [
            {
              model_key: 'grok-imagine-image',
              name: 'Grok Imagine',
              description: 'Fast image generation model',
              capabilities: ['t2i', 'i2i'],
              is_enabled: true,
              max_images: 10,
              max_prompt_length: 4096,
              supports_negative_prompt: false,
              aspect_ratios: ['1:1', '16:9', '9:16'],
              image: { edit_aspect_ratios: [] },
              video: null,
            },
            {
              model_key: 'grok-2-image-1212',
              name: 'Grok 2',
              description: 'High-quality image model',
              capabilities: ['t2i'],
              is_enabled: true,
              max_images: 10,
              max_prompt_length: 4096,
              supports_negative_prompt: false,
              aspect_ratios: ['1:1', '16:9', '9:16'],
              image: null,
              video: null,
            },
            {
              model_key: 'grok-imagine-video',
              name: 'Grok Video',
              description: 'Video generation model',
              capabilities: ['t2v', 'i2v', 'v2v', 'flf2v'],
              is_enabled: true,
              max_images: 1,
              max_prompt_length: 4096,
              supports_negative_prompt: false,
              aspect_ratios: ['1:1', '16:9', '9:16'],
              image: null,
              video: { max_duration: 15, resolutions: ['480p', '720p'] },
            },
          ],
        },
        {
          provider: 'aisha',
          name: 'Aisha',
          available: true,
          provisioning_mode: 'on_demand',
          models: [
            {
              model_key: 'aisha-image',
              name: 'Aisha',
              description: 'Aisha image generation model',
              capabilities: ['t2i', 'i2i'],
              is_enabled: true,
              max_images: 4,
              max_prompt_length: 4096,
              supports_negative_prompt: true,
              aspect_ratios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
              image: AISHA_IMAGE_CONSTRAINTS,
              video: null,
              session_state: 'none',
            },
          ],
        },
      ],
      user_context: null,
    }),
  ),

  // Generation endpoint — unified
  http.post(`${BASE}/v1/generate`, () => HttpResponse.json(makeJobCreatedResponse())),

  // Job status — use the new UnifiedJobResponse
  http.get(`${BASE}/v1/jobs/:job_id`, ({ params }) =>
    HttpResponse.json(makeUnifiedJobResponse({ id: params.job_id as string })),
  ),

  // Job list
  http.get(`${BASE}/v1/jobs`, () =>
    HttpResponse.json({
      items: [makeUnifiedJobResponse()],
      limit: 20,
      has_more: false,
      next_cursor: null,
    }),
  ),

  // Job delete
  http.delete(`${BASE}/v1/jobs/:job_id`, () => new HttpResponse(null, { status: 204 })),
];

export const jobNotFoundHandler = http.get(
  `${BASE}/v1/jobs/:job_id`,
  () => new HttpResponse(null, { status: 404 }),
);

export const jobDeleteFailHandler = http.delete(`${BASE}/v1/jobs/:job_id`, () =>
  HttpResponse.json({ status_code: 500, detail: 'Internal error' }, { status: 500 }),
);

// Override: aisha provider unavailable (orthogonality test — never offer Start when unavailable)
export const aishaUnavailableHandler = http.get(`${BASE}/v1/providers`, () =>
  HttpResponse.json({
    providers: [
      {
        provider: 'aisha',
        name: 'Aisha',
        available: false,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'aisha-image',
            name: 'Aisha',
            description: 'Aisha image generation model',
            capabilities: ['t2i', 'i2i'],
            is_enabled: true,
            max_images: 4,
            max_prompt_length: 4096,
            supports_negative_prompt: true,
            aspect_ratios: ['1:1'],
            image: AISHA_IMAGE_CONSTRAINTS,
            video: null,
            session_state: 'none',
          },
        ],
      },
    ],
    user_context: null,
  }),
);

// Override: aisha provider with active session (session_state: 'active')
export const aishaActiveSessionHandler = http.get(`${BASE}/v1/providers`, () =>
  HttpResponse.json({
    providers: [
      {
        provider: 'aisha',
        name: 'Aisha',
        available: true,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'aisha-image',
            name: 'Aisha',
            description: 'Aisha image generation model',
            capabilities: ['t2i', 'i2i'],
            is_enabled: true,
            max_images: 4,
            max_prompt_length: 4096,
            supports_negative_prompt: true,
            aspect_ratios: ['1:1'],
            image: AISHA_IMAGE_CONSTRAINTS,
            video: null,
            session_state: 'active',
          },
        ],
      },
    ],
    user_context: null,
  }),
);

function makeAishaProvider(session_state: string) {
  return {
    providers: [
      {
        provider: 'aisha',
        name: 'Aisha',
        available: true,
        provisioning_mode: 'on_demand',
        models: [
          {
            model_key: 'aisha-image',
            name: 'Aisha',
            description: 'Aisha image generation model',
            capabilities: ['t2i', 'i2i'],
            is_enabled: true,
            max_images: 4,
            max_prompt_length: 4096,
            supports_negative_prompt: true,
            aspect_ratios: ['1:1'],
            image: AISHA_IMAGE_CONSTRAINTS,
            video: null,
            session_state,
          },
        ],
      },
    ],
    user_context: null,
  };
}

export const aishaProvisioningHandler = http.get(`${BASE}/v1/providers`, () =>
  HttpResponse.json(makeAishaProvider('provisioning')),
);

export const aishaStaleHandler = http.get(`${BASE}/v1/providers`, () =>
  HttpResponse.json(makeAishaProvider('stale')),
);

export const aishaStoppingHandler = http.get(`${BASE}/v1/providers`, () =>
  HttpResponse.json(makeAishaProvider('stopping')),
);

export const aishaPausedHandler = http.get(`${BASE}/v1/providers`, () =>
  HttpResponse.json(makeAishaProvider('paused')),
);
