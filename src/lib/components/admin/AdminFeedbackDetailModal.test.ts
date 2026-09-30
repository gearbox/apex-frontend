import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { feedbackReportFixture } from '../../../mocks/handlers/feedback';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../mocks/factories/user';
import { resetLegalState } from '$lib/stores/legal';
import AdminFeedbackDetailModal from './AdminFeedbackDetailModal.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

const REPORT_ID = feedbackReportFixture.id;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(QueryHost, {
    props: hostProps(queryClient, AdminFeedbackDetailModal, {
      reportId: REPORT_ID,
      onclose: () => {},
    }),
  });
}

beforeEach(() => {
  resetLegalState();
  setAuth(
    {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile({ role: 'admin' }),
  );
});

afterEach(cleanup);

describe('AdminFeedbackDetailModal', () => {
  it.each([
    ['Dismiss', "Dismiss this report? This can't be undone.", 'dismissed'],
    ['Resolve', "Resolve this report? This can't be undone.", 'resolved'],
  ] as const)(
    'requires confirmation before %s and sends the terminal PATCH only on confirm',
    async (action, confirmation, status) => {
      const bodies: unknown[] = [];
      server.use(
        http.patch(`${BASE}/v1/admin/feedback/:report_id`, async ({ request }) => {
          bodies.push(await request.json());
          return HttpResponse.json({ ...feedbackReportFixture, status });
        }),
      );
      renderModal();
      await screen.findByRole('button', { name: action });

      await fireEvent.click(screen.getByRole('button', { name: action }));
      expect(screen.getByText(confirmation)).toBeTruthy();
      expect(bodies).toHaveLength(0);

      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.getByRole('button', { name: action })).toBeTruthy();

      await fireEvent.click(screen.getByRole('button', { name: action }));
      await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(bodies).toEqual([{ status }]));
    },
  );

  it('moves an open report to in progress without a confirmation step', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch(`${BASE}/v1/admin/feedback/:report_id`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ ...feedbackReportFixture, status: 'in_progress' });
      }),
    );
    renderModal();

    await fireEvent.click(await screen.findByRole('button', { name: 'Mark in progress' }));

    await waitFor(() => expect(bodies).toEqual([{ status: 'in_progress' }]));
    expect(screen.queryByText(/can't be undone/i)).toBeNull();
  });

  it('clears terminal confirmation after a 409 and refetches the detail', async () => {
    server.use(
      http.patch(`${BASE}/v1/admin/feedback/:report_id`, () =>
        HttpResponse.json(
          { error: 'invalid_status_transition', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    renderModal();

    await fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'This report was updated by another admin. The latest status has been loaded.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('updates a clean note when a status response brings a newer server note', async () => {
    server.use(
      http.get(`${BASE}/v1/admin/feedback/:report_id`, () =>
        HttpResponse.json({ ...feedbackReportFixture, admin_note: 'old' }),
      ),
      http.patch(`${BASE}/v1/admin/feedback/:report_id`, () =>
        HttpResponse.json({
          ...feedbackReportFixture,
          status: 'in_progress',
          admin_note: 'new',
        }),
      ),
    );
    renderModal();

    const note = (await screen.findByLabelText('Admin note')) as HTMLTextAreaElement;
    expect(note.value).toBe('old');
    await fireEvent.click(screen.getByRole('button', { name: 'Mark in progress' }));

    await waitFor(() => expect(note.value).toBe('new'));
  });

  it('preserves a dirty note when a 409 refetch brings a newer server note', async () => {
    let detailRequests = 0;
    server.use(
      http.get(`${BASE}/v1/admin/feedback/:report_id`, () => {
        detailRequests += 1;
        return HttpResponse.json({
          ...feedbackReportFixture,
          admin_note: detailRequests === 1 ? 'old' : 'another admin note',
        });
      }),
      http.patch(`${BASE}/v1/admin/feedback/:report_id`, () =>
        HttpResponse.json(
          { error: 'invalid_status_transition', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    renderModal();

    const note = (await screen.findByLabelText('Admin note')) as HTMLTextAreaElement;
    await fireEvent.input(note, { target: { value: 'my unsaved investigation' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await screen.findByText(
      'This report was updated by another admin. The latest status has been loaded.',
    );
    expect(note.value).toBe('my unsaved investigation');
    expect(detailRequests).toBeGreaterThanOrEqual(2);
  });

  it('shows a load error instead of a successful-refresh notice when 409 refetch fails', async () => {
    let detailRequests = 0;
    server.use(
      http.get(`${BASE}/v1/admin/feedback/:report_id`, () => {
        detailRequests += 1;
        return detailRequests === 1
          ? HttpResponse.json(feedbackReportFixture)
          : HttpResponse.json({ message: 'offline' }, { status: 503 });
      }),
      http.patch(`${BASE}/v1/admin/feedback/:report_id`, () =>
        HttpResponse.json(
          { error: 'invalid_status_transition', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    renderModal();

    await fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText("Couldn't load feedback.")).toBeTruthy();
    expect(
      screen.queryByText(
        'This report was updated by another admin. The latest status has been loaded.',
      ),
    ).toBeNull();
    expect(detailRequests).toBeGreaterThanOrEqual(2);
  });

  it('uses code points for the note limit and rejects a NUL', async () => {
    renderModal();
    const note = await screen.findByLabelText('Admin note');
    const save = screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement;

    await fireEvent.input(note, { target: { value: '😀'.repeat(4000) } });
    expect(save.disabled).toBe(false);
    await fireEvent.input(note, { target: { value: '😀'.repeat(4001) } });
    expect(save.disabled).toBe(true);
    expect(note.getAttribute('aria-describedby')).toBe('feedback-admin-note-error');
    expect(note.getAttribute('aria-invalid')).toBe('true');
    await fireEvent.input(note, { target: { value: 'valid note\u0000' } });
    expect(save.disabled).toBe(true);
    expect(note.getAttribute('aria-describedby')).toBe('feedback-admin-note-error');
  });

  it('renders only the validated feedback asset link with safe new-tab attributes', async () => {
    const { container } = renderModal();
    const link = await screen.findByRole('link', { name: 'Open reported asset' });
    expect(link.getAttribute('href')).toMatch(new RegExp(`/v1/content/feedback/${REPORT_ID}$`));
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(container.querySelectorAll('.asset-link')).toHaveLength(1);
  });

  it('renders report metadata as literal text without parsing HTML or Markdown', async () => {
    const untrusted =
      '<script>window.__feedback_xss = true</script> <img src=x onerror="window.__feedback_xss = true"> **markdown**';
    server.use(
      http.get(`${BASE}/v1/admin/feedback/:report_id`, () =>
        HttpResponse.json({
          ...feedbackReportFixture,
          message: untrusted,
          admin_note: untrusted,
          client_path: untrusted,
          user_agent: untrusted,
        }),
      ),
    );
    const { container } = renderModal();

    const message = await screen.findByText(untrusted, { selector: 'p' });
    expect(message.textContent).toBe(untrusted);
    expect((screen.getByLabelText('Admin note') as HTMLTextAreaElement).value).toBe(untrusted);
    const untrustedMetadata = Array.from(
      container.querySelectorAll<HTMLElement>('p.untrusted, dd.untrusted'),
    );
    expect(untrustedMetadata).toHaveLength(3);
    expect(untrustedMetadata.every((field) => field.textContent === untrusted)).toBe(true);
    expect(container.querySelectorAll('script, img')).toHaveLength(0);
    expect(container.textContent).toContain('**markdown**');
  });

  it.each([null, '/v1/content/outputs/11111111-1111-4111-8111-111111111111'])(
    'does not render an asset link for %s',
    async (asset_url) => {
      server.use(
        http.get(`${BASE}/v1/admin/feedback/:report_id`, () =>
          HttpResponse.json({ ...feedbackReportFixture, asset_url }),
        ),
      );
      renderModal();

      await screen.findByText(feedbackReportFixture.message);
      expect(screen.queryByRole('link', { name: 'Open reported asset' })).toBeNull();
    },
  );
});
