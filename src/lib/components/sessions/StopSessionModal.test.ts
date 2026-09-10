import { afterEach, describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';

vi.mock('$paraglide/messages', () => ({
  session_stop_title: () => 'Stop Session',
  session_stop_preview_tokens: () => 'Estimated final tokens',
  session_stop_preview_duration: () => 'Active duration',
  session_stop_preview_gpu: () => 'GPU',
  session_stop_confirm: () => 'Stop Session',
  session_stop_cancel: () => 'Keep Running',
  session_stopping: () => 'Stopping…',
  session_stop_load_failed: () => 'Failed to load session information.',
  session_stop_confirm_failed: () => 'Failed to stop session.',
  common_loading: () => 'Loading…',
  common_close: () => 'Close',
}));

vi.mock('$paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'en'),
  setLocale: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

const mockPreview = {
  session_id: 'sess_001',
  model_type: 'aisha-image',
  vastai_gpu_name: 'RTX 4090',
  vastai_cost_per_hour_micros: 50000,
  active_duration_seconds: 3661,
  paused_duration_seconds: 0,
  estimated_final_tokens: 500,
  message: 'This will stop your session.',
};

import StopSessionModalQueryHost from './testing/StopSessionModalQueryHost.svelte';

function renderModal(props: {
  sessionId: string;
  onStopped?: (session: unknown) => void;
  onClose?: () => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(StopSessionModalQueryHost, { props: { queryClient, ...props } });
}

afterEach(() => cleanup());

describe('StopSessionModal', () => {
  it('shows loading state initially, then renders preview data', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        const body = (await request.json()) as { confirmed: boolean };
        if (!body.confirmed) {
          return HttpResponse.json(mockPreview);
        }
        return HttpResponse.json({ id: 'sess_001', status: 'stopping' });
      }),
    );

    renderModal({ sessionId: 'sess_001' });

    expect(screen.queryByText(/loading/i)).not.toBeNull();

    await waitFor(() => {
      expect(screen.queryByText('500')).not.toBeNull();
    });

    expect(screen.queryByText(/1h 01m 01s/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /stop session/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /keep running/i })).not.toBeNull();
  });

  it('calls the confirmed stop endpoint and invokes onStopped', async () => {
    const onStopped = vi.fn();

    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        const body = (await request.json()) as { confirmed: boolean };
        if (!body.confirmed) {
          return HttpResponse.json(mockPreview);
        }
        return HttpResponse.json({ id: 'sess_001', status: 'stopping' });
      }),
    );

    renderModal({ sessionId: 'sess_001', onStopped });

    await waitFor(() => {
      const btn = screen.queryByRole('button', {
        name: /stop session/i,
      }) as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn!.disabled).toBe(false);
    });

    screen.getByRole('button', { name: /stop session/i }).click();

    await waitFor(() => {
      expect(onStopped).toHaveBeenCalledOnce();
    });
  });

  it('does not send a second confirmed stop request on a same-tick double click', async () => {
    let confirmedCalls = 0;
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, async ({ request }) => {
        const body = (await request.json()) as { confirmed: boolean };
        if (!body.confirmed) return HttpResponse.json(mockPreview);
        confirmedCalls += 1;
        return HttpResponse.json({ id: 'sess_001', status: 'stopping' });
      }),
    );

    renderModal({ sessionId: 'sess_001' });
    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: /stop session/i }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    const confirmButton = screen.getByRole('button', { name: /stop session/i });
    confirmButton.click();
    confirmButton.click();

    await waitFor(() => expect(confirmedCalls).toBeGreaterThan(0));
    expect(confirmedCalls).toBe(1);
  });

  it('shows a localized error message when the preview request fails', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Session not found', status_code: 404 },
          { status: 404 },
        ),
      ),
    );

    renderModal({ sessionId: 'sess_missing' });

    await waitFor(() => {
      expect(screen.queryByText(/session not found/i)).not.toBeNull();
    });

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeNull();
  });
});
