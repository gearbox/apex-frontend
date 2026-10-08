import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';

export const feedbackReportFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'generation' as const,
  status: 'open' as const,
  message: 'The generated result did not match the selected model settings.',
  user_id: '22222222-2222-4222-8222-222222222222',
  user_email: 'reporter@example.com',
  job_id: '33333333-3333-4333-8333-333333333333',
  asset_ref: 'output:44444444-4444-4444-8444-444444444444',
  asset_url: '/v1/content/feedback/11111111-1111-4111-8111-111111111111',
  client_path: '/app/library',
  app_version: '0.27.1+testsha',
  user_agent: 'Mock browser',
  admin_note: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-09-29T12:00:00Z',
  updated_at: '2026-09-29T12:00:00Z',
};

export const feedbackHandlers = [
  http.post(`${BASE}/v1/feedback`, () =>
    HttpResponse.json(
      {
        id: '55555555-5555-4555-8555-555555555555',
        status: 'open',
        created_at: '2026-09-29T12:00:00Z',
      },
      { status: 201 },
    ),
  ),
  http.get(`${BASE}/v1/admin/feedback`, () =>
    HttpResponse.json({
      items: [feedbackReportFixture],
      limit: 30,
      has_more: false,
      next_cursor: null,
    }),
  ),
  http.get(`${BASE}/v1/admin/feedback/:report_id`, ({ params }) =>
    HttpResponse.json({ ...feedbackReportFixture, id: params.report_id as string }),
  ),
  http.patch(`${BASE}/v1/admin/feedback/:report_id`, async ({ params, request }) => {
    const body = (await request.json()) as { status?: string; admin_note?: string | null };
    return HttpResponse.json({
      ...feedbackReportFixture,
      id: params.report_id as string,
      ...(body.status ? { status: body.status } : {}),
      ...(Object.hasOwn(body, 'admin_note') ? { admin_note: body.admin_note } : {}),
      updated_at: '2026-09-29T12:05:00Z',
    });
  }),
];
