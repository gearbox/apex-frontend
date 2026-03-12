import { http, HttpResponse } from 'msw';
import { makeJobCreatedResponse, makeUnifiedJobResponse } from '../factories/job';
import { MOCK_BASE_URL as BASE } from '../config';

export const jobHandlers = [
  // Generation endpoints — return JobCreatedResponse
  http.post(`${BASE}/v1/grok/image`, () => HttpResponse.json(makeJobCreatedResponse())),
  http.post(`${BASE}/v1/grok/image/edit`, () => HttpResponse.json(makeJobCreatedResponse({ generation_type: 'i2i' }))),
  http.post(`${BASE}/v1/grok/video`, () => HttpResponse.json(makeJobCreatedResponse({ generation_type: 't2v', model: 'grok-imagine-video' }))),
  http.post(`${BASE}/v1/grok/video/from-image`, () => HttpResponse.json(makeJobCreatedResponse({ generation_type: 'i2v', model: 'grok-imagine-video' }))),

  // Provider info
  http.get(`${BASE}/v1/grok`, () =>
    HttpResponse.json({
      provider: 'grok',
      name: 'xAI Grok',
      available: true,
      models: [
        {
          model: 'grok-imagine-image',
          name: 'Grok Imagine',
          description: 'Fast image model',
          supports_t2i: true,
          supports_i2i: true,
          supports_t2v: false,
          supports_i2v: false,
          supports_v2v: false,
          max_images: 10,
        },
      ],
    }),
  ),

  // Job status — use the new UnifiedJobResponse
  http.get(`${BASE}/v1/jobs/:job_id`, ({ params }) =>
    HttpResponse.json(makeUnifiedJobResponse({ id: params.job_id as string })),
  ),

  // Job list
  http.get(`${BASE}/v1/jobs`, () =>
    HttpResponse.json({ items: [makeUnifiedJobResponse()], total: 1, limit: 20, offset: 0 }),
  ),

  // Job delete
  http.delete(`${BASE}/v1/jobs/:job_id`, () => new HttpResponse(null, { status: 204 })),
];

export const jobNotFoundHandler = http.get(
  `${BASE}/v1/jobs/:job_id`,
  () => new HttpResponse(null, { status: 404 }),
);

export const jobDeleteFailHandler = http.delete(
  `${BASE}/v1/jobs/:job_id`,
  () => HttpResponse.json({ status_code: 500, detail: 'Internal error' }, { status: 500 }),
);
