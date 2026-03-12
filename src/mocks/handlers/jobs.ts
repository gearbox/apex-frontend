import { http, HttpResponse } from 'msw';
import { makeGrokJobResponse, makeGrokJobStatusResponse } from '../factories/job';
import { MOCK_BASE_URL as BASE } from '../config';

export const jobHandlers = [
  http.post(`${BASE}/v1/grok/image`, () => HttpResponse.json(makeGrokJobResponse())),

  http.post(`${BASE}/v1/grok/image/edit`, () => HttpResponse.json(makeGrokJobResponse())),

  http.post(`${BASE}/v1/grok/video`, () => HttpResponse.json(makeGrokJobResponse())),

  http.post(`${BASE}/v1/grok/video/from-image`, () => HttpResponse.json(makeGrokJobResponse())),

  http.get(`${BASE}/v1/grok/jobs/:job_id`, () =>
    HttpResponse.json(makeGrokJobStatusResponse()),
  ),

  http.get(`${BASE}/v1/grok`, () =>
    HttpResponse.json({
      provider: 'grok',
      name: 'xAI Grok',
      available: true,
      models: [
        {
          model: 'aisha',
          name: 'Aisha',
          description: 'Fast image model',
          supports_t2i: true,
          supports_i2i: false,
          supports_t2v: false,
          supports_i2v: false,
          supports_v2v: false,
          max_images: 4,
        },
      ],
    }),
  ),

  http.get(`${BASE}/v1/jobs`, () =>
    HttpResponse.json({ items: [], total: 0 }),
  ),

  http.get(`${BASE}/v1/jobs/:job_id`, () =>
    HttpResponse.json(makeGrokJobStatusResponse()),
  ),
];
