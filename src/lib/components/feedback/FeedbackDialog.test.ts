import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../mocks/factories/user';
import { feedbackDialog } from '$lib/stores/feedbackDialog.svelte';
import FeedbackDialog from './FeedbackDialog.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

const validMessage = 'The generated image is completely blank.';

function renderDialog(context: Parameters<typeof feedbackDialog.open>[0] = {}) {
  feedbackDialog.open(context);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(QueryHost, { props: hostProps(queryClient, FeedbackDialog, {}) });
}

async function submitMessage(message = validMessage): Promise<void> {
  await fireEvent.input(screen.getByLabelText('What happened?'), { target: { value: message } });
  await fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
}

beforeEach(() => {
  setAuth(
    {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile(),
  );
  feedbackDialog.reset();
});

afterEach(() => {
  cleanup();
  feedbackDialog.reset();
});

describe('FeedbackDialog', () => {
  it('renders only the two action labels between the buttons', () => {
    const { container } = renderDialog();
    expect(container.querySelector('.actions')?.textContent?.replace(/\s+/g, '')).toBe(
      'CancelSendreport',
    );
  });

  it.each([
    ['job_not_found', 404, { jobId: 'job-missing' }, 'The linked job is no longer available.'],
    [
      'asset_not_found',
      404,
      { assetRef: 'output:missing' },
      'The linked result is no longer available.',
    ],
    ['rate_limited', 429, {}, "You've sent several reports recently. Please try again later."],
    ['validation_error', 400, {}, 'Please check your report and try again.'],
    ['framework_bad_request', 400, {}, "We couldn't send your report. Please try again."],
    ['framework_failure', 413, {}, "We couldn't send your report. Please try again."],
  ] as const)(
    'maps %s safely to the localized form state',
    async (error, status, context, text) => {
      server.use(
        http.post(`${BASE}/v1/feedback`, () =>
          HttpResponse.json(
            error === 'framework_failure' || error === 'framework_bad_request'
              ? { detail: 'Server text must not be shown' }
              : { error, message: 'Server text must not be shown', status_code: status },
            { status },
          ),
        ),
      );
      renderDialog(context);

      await submitMessage();

      await waitFor(() => expect(screen.getByText(text)).toBeTruthy());
    },
  );

  it.each([
    ['job', { jobId: 'job-missing', assetRef: 'output:kept' }, 'Send without linked job', 'job_id'],
    [
      'asset',
      { jobId: 'job-kept', assetRef: 'output:missing' },
      'Send without linked result',
      'asset_ref',
    ],
  ] as const)(
    'removes a stale %s link and resubmits exactly once without it',
    async (kind, context, resendLabel, omittedKey) => {
      const bodies: Record<string, unknown>[] = [];
      let attempts = 0;
      server.use(
        http.post(`${BASE}/v1/feedback`, async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          attempts += 1;
          if (attempts === 1) {
            const error = kind === 'job' ? 'job_not_found' : 'asset_not_found';
            return HttpResponse.json({ error, status_code: 404 }, { status: 404 });
          }
          return HttpResponse.json(
            {
              id: '55555555-5555-4555-8555-555555555555',
              status: 'open',
              created_at: '2026-09-29T00:00:00Z',
            },
            { status: 201 },
          );
        }),
      );
      renderDialog(context);

      await submitMessage();
      await fireEvent.click(await screen.findByRole('button', { name: resendLabel }));

      await waitFor(() => expect(screen.getByText('Thanks — we got your report.')).toBeTruthy());
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).not.toHaveProperty(omittedKey);
      expect(bodies[1]).toMatchObject(
        kind === 'job' ? { asset_ref: 'output:kept' } : { job_id: 'job-kept' },
      );
    },
  );

  it('counts code points and enables submission at the inclusive maximum', async () => {
    renderDialog();
    const textarea = screen.getByLabelText('What happened?');
    const submit = screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement;

    expect(screen.getByText('0 / 4000')).toBeTruthy();
    await fireEvent.input(textarea, { target: { value: '😀'.repeat(9) } });
    expect(submit.disabled).toBe(true);
    await fireEvent.input(textarea, { target: { value: '😀'.repeat(4000) } });
    expect(screen.getByText('4000 / 4000')).toBeTruthy();
    expect(submit.disabled).toBe(false);
    await fireEvent.input(textarea, { target: { value: '😀'.repeat(4001) } });
    expect(submit.disabled).toBe(true);
  });

  it('associates the inline validation error with the message field only while it is shown', async () => {
    renderDialog();
    const textarea = screen.getByLabelText('What happened?');

    await fireEvent.input(textarea, { target: { value: 'Too short' } });

    expect(screen.getByText('Please enter at least 10 characters.')).toBeTruthy();
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toEqual([
      'feedback-message-help',
      'feedback-message-count',
      'feedback-message-error',
    ]);

    await fireEvent.input(textarea, { target: { value: validMessage } });

    expect(screen.queryByText('Please enter at least 10 characters.')).toBeNull();
    expect(textarea.getAttribute('aria-describedby')?.split(' ')).toEqual([
      'feedback-message-help',
      'feedback-message-count',
    ]);
  });
});
