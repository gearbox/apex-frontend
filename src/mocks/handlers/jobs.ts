import { http, HttpResponse } from 'msw';
import { makeJobCreatedResponse, makeUnifiedJobResponse } from '../factories/job';
import { MOCK_BASE_URL as BASE } from '../config';
import {
  makeModelInfo,
  makeGrokImageModelInfo,
  makeGrokVideoModelInfo,
  makeAishaImageModelInfo,
  generationModes,
} from '../factories/providers';

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
            makeGrokImageModelInfo(),
            makeModelInfo({
              model_key: 'grok-2-image-1212',
              name: 'Grok 2',
              description: 'High-quality image model',
              generation_modes: generationModes(['t2i']),
              image: null,
            }),
            makeGrokVideoModelInfo(),
          ],
        },
        {
          provider: 'aisha',
          name: 'Aisha',
          available: true,
          provisioning_mode: 'on_demand',
          models: [makeAishaImageModelInfo({ runtime: makeRuntime('none') })],
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

function makeRuntime(state: 'none' | 'provisioning' | 'active' | 'paused' | 'stale' | 'stopping') {
  return {
    state,
    session_id: state === 'none' ? null : 'sess_aisha_001',
    deployment_id: state === 'none' ? null : 'deploy_aisha_001',
    operation_id: state === 'provisioning' ? 'op_aisha_001' : null,
  };
}
