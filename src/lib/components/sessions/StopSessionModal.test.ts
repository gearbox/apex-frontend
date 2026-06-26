import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';

vi.mock('$paraglide/messages', () => ({
  session_stop_title: () => 'Stop Session',
  session_stop_preview_tokens: () => 'Estimated final tokens',
  session_stop_preview_duration: () => 'Active duration',
  session_stop_confirm: () => 'Stop Session',
  session_stop_cancel: () => 'Keep Running',
  session_stopping: () => 'Stopping…',
  common_loading: () => 'Loading…',
  common_close: () => 'Close',
}));

vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
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

import StopSessionModal from './StopSessionModal.svelte';

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

    render(StopSessionModal, {
      props: { sessionId: 'sess_001', onStopped: vi.fn(), onClose: vi.fn() },
    });

    expect(screen.queryByText(/loading/i)).not.toBeNull();

    await waitFor(() => {
      expect(screen.queryByText('500')).not.toBeNull();
    });

    expect(screen.queryByText(/1h 01m 01s/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /stop session/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /keep running/i })).not.toBeNull();
  });

  it('calls stopSession on confirm and invokes onStopped', async () => {
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

    render(StopSessionModal, {
      props: { sessionId: 'sess_001', onStopped, onClose: vi.fn() },
    });

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

  it('shows error message when previewStop fails', async () => {
    server.use(
      http.post(`${BASE}/v1/sessions/:session_id/stop`, () =>
        HttpResponse.json(
          { error: 'not_found', message: 'Session not found', status_code: 404 },
          { status: 404 },
        ),
      ),
    );

    render(StopSessionModal, {
      props: { sessionId: 'sess_missing', onStopped: vi.fn(), onClose: vi.fn() },
    });

    await waitFor(() => {
      expect(screen.queryByText(/session not found/i)).not.toBeNull();
    });

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeNull();
  });
});
