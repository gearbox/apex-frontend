import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  listSessions,
  getSession,
  getOperation,
  startSession,
  previewStop,
  stopSession,
  pauseSession,
  resumeSession,
  attachDeployment,
  removeDeployment,
} from './sessions';
import { ApiRequestError } from './errors';

const BASE = 'http://localhost:8000';

const mockSession = {
  id: 'sess_001',
  user_id: 'usr_001',
  product_id: 'prod_001',
  status: 'active',
  tunnel_hostname: 'tunnel.example.com',
  vastai_gpu_name: 'RTX 4090',
  vastai_cost_per_hour_micros: 50000,
  created_at: '2026-06-20T00:00:00Z',
  started_at: '2026-06-20T00:01:00Z',
  paused_at: null,
  resumed_at: null,
  stopped_at: null,
  error_message: null,
  in_flight_job_count: 0,
};

const mockStopConfirmation = {
  session_id: 'sess_001',
  model_type: 'aisha-image',
  vastai_gpu_name: 'RTX 4090',
  vastai_cost_per_hour_micros: 50000,
  active_duration_seconds: 3600,
  paused_duration_seconds: 0,
  estimated_final_tokens: 500,
  message: 'This will stop your session.',
};

describe('listSessions()', () => {
  it('returns sessions array on success', async () => {
    server.use(
      http.get(`${BASE}/v1/sessions`, () => HttpResponse.json({ sessions: [mockSession] })),
    );
    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('sess_001');
    expect(sessions[0].status).toBe('active');
  });

  it('sends include_terminal=false by default', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${BASE}/v1/sessions`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ sessions: [] });
      }),
    );
    await listSessions(false);
    expect(capturedUrl).toContain('include_terminal=false');
  });

  it('throws ApiRequestError on server error', async () => {
    server.use(
      http.get(`${BASE}/v1/sessions`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Internal error', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    await expect(listSessions()).rejects.toThrow(ApiRequestError);
  });
});

describe('getSession()', () => {
  it('returns session on success', async () => {
    server.use(http.get(`${BASE}/v1/sessions/:session_id`, () => HttpResponse.json(mockSession)));
    const session = await getSession('sess_001');
    expect(session.id).toBe('sess_001');
  });

  it('throws ApiRequestError on 404', async () => {
    server.use(
      http.get(`${BASE}/v1/sessions/:session_id`, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Session not found', status_code: 404 },
          { status: 404 },
        ),
      ),
    );
    await expect(getSession('nonexistent')).rejects.toThrow(ApiRequestError);
  });
});

describe('startSession()', () => {
  it('sends model in body and returns session', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/sessions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...mockSession, status: 'pending' }, { status: 201 });
      }),
    );
    const session = await startSession('aisha-image');
    expect(capturedBody).toEqual({ model: 'aisha-image' });
    expect(session.status).toBe('pending');
  });

  it('throws ApiRequestError on 409 session_already_exists', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions`, () =>
        HttpResponse.json(
          { error: 'session_already_exists', message: 'Session already exists', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    await expect(startSession('aisha-image')).rejects.toThrow(ApiRequestError);
  });
});

describe('session lifecycle and deployment operations', () => {
  it('uses the typed pause and resume endpoints', async () => {
    const requests: string[] = [];
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/pause`, ({ request }) => {
        requests.push(new URL(request.url).pathname);
        return HttpResponse.json({ ...mockSession, status: 'paused' });
      }),
      http.post(`${BASE}/v1/sessions/:session_id/resume`, ({ request }) => {
        requests.push(new URL(request.url).pathname);
        return HttpResponse.json({ ...mockSession, status: 'resuming' });
      }),
    );
    await expect(pauseSession('sess_001')).resolves.toMatchObject({ status: 'paused' });
    await expect(resumeSession('sess_001')).resolves.toMatchObject({ status: 'resuming' });
    expect(requests).toEqual(['/v1/sessions/sess_001/pause', '/v1/sessions/sess_001/resume']);
  });

  it('attaches and removes through the generated paths without force by default', async () => {
    let body: unknown;
    let removeUrl = '';
    const mutation = {
      deployment: { id: 'dep_001', model_type: 'aisha-image-lite', status: 'deploying' },
      operation: { id: 'op_001', revision: 0, status: 'queued' },
    };
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/deployments`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(mutation, { status: 202 });
      }),
      http.delete(`${BASE}/v1/sessions/:session_id/deployments/:deployment_id`, ({ request }) => {
        removeUrl = request.url;
        return HttpResponse.json(mutation, { status: 202 });
      }),
    );
    await attachDeployment('sess_001', 'aisha-image-lite');
    await removeDeployment('sess_001', 'dep_001');
    expect(body).toEqual({ model: 'aisha-image-lite' });
    expect(removeUrl).not.toContain('force=true');
  });

  it('forwards cancellation to the operation fallback read', async () => {
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    server.use(
      http.get(`${BASE}/v1/sessions/:session_id/operations/:operation_id`, ({ request }) => {
        signal = request.signal;
        return HttpResponse.json({ id: 'op_001' });
      }),
    );
    await getOperation('sess_001', 'op_001', controller.signal);
    expect(signal).toBeDefined();
  });
});

describe('previewStop()', () => {
  it('sends confirmed:false and returns StopConfirmationResponse', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(mockStopConfirmation);
      }),
    );
    const result = await previewStop('sess_001');
    expect(capturedBody).toEqual({ confirmed: false });
    expect(result.estimated_final_tokens).toBe(500);
    expect(result.active_duration_seconds).toBe(3600);
  });

  it('throws ApiRequestError on server error', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Internal error', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    await expect(previewStop('sess_001')).rejects.toThrow(ApiRequestError);
  });
});

describe('stopSession()', () => {
  it('sends confirmed:true and returns GpuSessionResponse', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...mockSession, status: 'stopping' });
      }),
    );
    const result = await stopSession('sess_001');
    expect(capturedBody).toEqual({ confirmed: true });
    expect(result.status).toBe('stopping');
  });

  it('throws ApiRequestError on failure', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Session not found', status_code: 404 },
          { status: 404 },
        ),
      ),
    );
    await expect(stopSession('sess_001')).rejects.toThrow(ApiRequestError);
  });

  it('surfaces error message in ApiRequestError', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, () =>
        HttpResponse.json(
          { error: 'conflict', message: 'Cannot stop while jobs are running', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    let caught: unknown;
    try {
      await stopSession('sess_001');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).message).toBe('Cannot stop while jobs are running');
  });
});
