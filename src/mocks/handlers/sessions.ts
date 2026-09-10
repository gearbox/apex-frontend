import { http, HttpResponse } from 'msw';
import {
  makeDeploymentMutationResponse,
  makeGpuSessionListItemResponse,
  makeGpuSessionResponse,
  makeOperationResponse,
  makeStopConfirmationResponse,
} from '../factories/session';
import { MOCK_BASE_URL as BASE } from '../config';

export const sessionHandlers = [
  // List sessions — the thin list-item projection, not the full detail shape.
  http.get(`${BASE}/v1/sessions`, () =>
    HttpResponse.json({ sessions: [makeGpuSessionListItemResponse()] }),
  ),

  // Get a full session snapshot, including embedded operations when supplied by a test override.
  http.get(`${BASE}/v1/sessions/:session_id`, ({ params }) =>
    HttpResponse.json(makeGpuSessionResponse({ id: params.session_id as string })),
  ),

  // Start session → returns pending/provisioning state
  http.post(`${BASE}/v1/sessions`, () =>
    HttpResponse.json(
      makeGpuSessionResponse({
        id: 'sess_mock_new',
        status: 'pending',
        started_at: null,
        tunnel_hostname: null,
        vastai_gpu_name: null,
      }),
      { status: 201 },
    ),
  ),

  // Stop session — branches on confirmed
  http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request, params }) => {
    const body = (await request.json()) as { confirmed: boolean };
    if (!body.confirmed) {
      return HttpResponse.json(
        makeStopConfirmationResponse({ session_id: params.session_id as string }),
      );
    }
    return HttpResponse.json(
      makeGpuSessionResponse({ id: params.session_id as string, status: 'stopping' }),
    );
  }),

  // Pause / resume
  http.post(`${BASE}/v1/sessions/:session_id/pause`, ({ params }) =>
    HttpResponse.json(
      makeGpuSessionResponse({ id: params.session_id as string, status: 'paused' }),
    ),
  ),
  http.post(`${BASE}/v1/sessions/:session_id/resume`, ({ params }) =>
    HttpResponse.json(
      makeGpuSessionResponse({ id: params.session_id as string, status: 'active' }),
    ),
  ),

  // Attach / remove deployment
  http.post(`${BASE}/v1/sessions/:session_id/deployments`, ({ params }) =>
    HttpResponse.json(
      makeDeploymentMutationResponse({
        operation: makeOperationResponse({ session_id: params.session_id as string }),
      }),
      { status: 202 },
    ),
  ),
  http.delete(`${BASE}/v1/sessions/:session_id/deployments/:deployment_id`, ({ params }) =>
    HttpResponse.json(
      makeDeploymentMutationResponse({
        deployment: {
          ...makeDeploymentMutationResponse().deployment,
          id: params.deployment_id as string,
          status: 'removing',
        },
        operation: makeOperationResponse({
          session_id: params.session_id as string,
          kind: 'bundle_removal',
        }),
      }),
      { status: 202 },
    ),
  ),

  // Operation fallback GET
  http.get(`${BASE}/v1/sessions/:session_id/operations/:operation_id`, ({ params }) =>
    HttpResponse.json(
      makeOperationResponse({
        id: params.operation_id as string,
        session_id: params.session_id as string,
      }),
    ),
  ),
];

// Override: already has a session (409)
export const sessionAlreadyExistsHandler = http.post(`${BASE}/v1/sessions`, () =>
  HttpResponse.json(
    { error: 'session_already_exists', message: 'Session already exists', status_code: 409 },
    { status: 409 },
  ),
);

// Override: list returns empty
export const noSessionsHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({ sessions: [] }),
);

// Override: session in provisioning state
export const sessionProvisioningHandler = http.get(
  `${BASE}/v1/sessions/:session_id`,
  ({ params }) =>
    HttpResponse.json(
      makeGpuSessionResponse({
        id: params.session_id as string,
        status: 'provisioning',
        started_at: null,
        vastai_gpu_name: null,
        tunnel_hostname: null,
      }),
    ),
);

// Override: provider unavailable
export const sessionProviderUnavailableHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({ sessions: [] }),
);

// Override: list returns a provisioning session for aisha-image
export const sessionListProvisioningHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({
    sessions: [
      makeGpuSessionListItemResponse({
        id: 'sess_provisioning',
        status: 'provisioning',
        started_at: null,
      }),
    ],
  }),
);

// Override: list returns a stale session for aisha-image
export const sessionListStaleHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({
    sessions: [makeGpuSessionListItemResponse({ id: 'sess_stale', status: 'stale' })],
  }),
);

// Override: list returns an active session for aisha-image
export const sessionListActiveHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({
    sessions: [makeGpuSessionListItemResponse({ id: 'sess_active', status: 'active' })],
  }),
);
