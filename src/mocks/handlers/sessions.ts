import { http, HttpResponse } from 'msw';
import { makeGpuSessionResponse, makeStopConfirmationResponse } from '../factories/session';
import { MOCK_BASE_URL as BASE } from '../config';

export const sessionHandlers = [
  // List sessions
  http.get(`${BASE}/v1/sessions`, () =>
    HttpResponse.json({ sessions: [makeGpuSessionResponse()] }),
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
      makeGpuSessionResponse({
        id: 'sess_provisioning',
        status: 'provisioning',
        started_at: null,
        tunnel_hostname: null,
        vastai_gpu_name: null,
      }),
    ],
  }),
);

// Override: list returns a stale session for aisha-image
export const sessionListStaleHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({
    sessions: [
      makeGpuSessionResponse({
        id: 'sess_stale',
        status: 'stale',
        error_message: 'Connection lost',
      }),
    ],
  }),
);

// Override: list returns an active session for aisha-image
export const sessionListActiveHandler = http.get(`${BASE}/v1/sessions`, () =>
  HttpResponse.json({
    sessions: [makeGpuSessionResponse({ id: 'sess_active', status: 'active' })],
  }),
);
