import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import CreateSessionPanel from './CreateSessionPanel.svelte';
import type { CardState } from '$lib/utils/sessionState';

vi.mock('@tanstack/svelte-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/svelte-query')>('@tanstack/svelte-query');
  return {
    ...actual,
    createQuery: vi.fn(() => ({
      get data() {
        return { balance: 1000 };
      },
      get isLoading() {
        return false;
      },
      get isError() {
        return false;
      },
    })),
  };
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$paraglide/messages', () => ({
  create_state_active: () => 'Session active',
  create_state_needs_session: () => 'Needs GPU session',
  create_state_provisioning: () => 'Starting…',
  create_state_stale: () => 'Session unreachable',
  create_state_stopping: () => 'Stopping…',
  create_state_unavailable: () => 'Temporarily unavailable',
  create_state_sign_in: () => 'Sign in to use',
  create_session_start: () => 'Start session',
  create_session_stop: () => 'Stop session',
  create_session_cancel: () => 'Cancel',
  create_session_sign_in_cta: () => 'Sign in',
  create_session_paused_note: () => 'Session is paused.',
  gpu_session_start_hint_with_time: ({ time }: { time: string }) =>
    `This model usually takes around ${time} to provision. Billed by the minute, with a 5-minute minimum.`,
  gpu_session_start_hint_without_time: () => 'Billed by the minute, with a 5-minute minimum.',
  create_session_uptime: () => 'Uptime',
  create_session_manage_link: () => 'Manage in Sessions',
  generate_btn_topup: () => 'Top up to generate',
}));

vi.mock('$paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'en'),
  setLocale: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

const mockSession = {
  id: 'sess_001',
  user_id: 'usr_001',
  product_id: 'prod_001',
  status: 'active' as const,
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

function renderPanel(
  cardState: CardState,
  overrides: Partial<ComponentProps<typeof CreateSessionPanel>> = {},
) {
  const onStart = vi.fn();
  const onStopRequest = vi.fn();
  const rendered = render(CreateSessionPanel, {
    props: {
      cardState,
      session: null,
      starting: false,
      onStart,
      onStopRequest,
      ...overrides,
    },
  });
  return { ...rendered, onStart, onStopRequest };
}

describe('CreateSessionPanel', () => {
  it('READY (always_on, no session): renders nothing', () => {
    const { container } = renderPanel('READY', { session: null });
    expect(container.querySelector('.panel')).toBeNull();
  });

  it('READY (on_demand active session): shows badge + uptime + Stop button', () => {
    const { onStopRequest } = renderPanel('READY', { session: mockSession });
    expect(screen.getByText('Session active')).toBeTruthy();
    expect(screen.getByText('Uptime')).toBeTruthy();
    const stopBtn = screen.getByRole('button', { name: /Stop session/i });
    expect(stopBtn).toBeTruthy();
    fireEvent.click(stopBtn);
    expect(onStopRequest).toHaveBeenCalledOnce();
  });

  it('READY: keeps uptime without displaying the provider cost as user billing', () => {
    const { container } = renderPanel('READY', { session: mockSession });

    expect(screen.getByText('Uptime')).toBeTruthy();
    expect(container.textContent).not.toContain('Cost so far');
    expect(container.textContent).not.toMatch(/\$\d+\.\d{4}/);
  });

  it('NEEDS_SESSION: shows the model-specific bootstrap hint + Start button', () => {
    const { onStart, container } = renderPanel('NEEDS_SESSION', { typicalBootstrapSeconds: 600 });
    expect(screen.getByText('Needs GPU session')).toBeTruthy();
    expect(screen.getByText(/This model usually takes around 10m to provision/)).toBeTruthy();
    expect(screen.getByText(/Billed by the minute, with a 5-minute minimum/)).toBeTruthy();
    expect(container.textContent).not.toContain('30–90');
    const startBtn = screen.getByRole('button', { name: /Start session/i });
    expect(startBtn).toBeTruthy();
    fireEvent.click(startBtn);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('NEEDS_SESSION: falls back to localized billing-only text without a bootstrap hint', () => {
    const { container } = renderPanel('NEEDS_SESSION', { typicalBootstrapSeconds: null });
    expect(screen.getByText('Billed by the minute, with a 5-minute minimum.')).toBeTruthy();
    expect(container.textContent).not.toContain('30–90');
    expect(container.textContent).not.toContain('provision');
  });

  it('NEEDS_SESSION: updates the displayed model-specific bootstrap hint', async () => {
    const rendered = renderPanel('NEEDS_SESSION', { typicalBootstrapSeconds: 600 });
    expect(screen.getByText(/10m/)).toBeTruthy();

    await rendered.rerender({
      cardState: 'NEEDS_SESSION',
      session: null,
      starting: false,
      typicalBootstrapSeconds: 180,
      onStart: rendered.onStart,
      onStopRequest: rendered.onStopRequest,
    });

    expect(screen.getByText(/This model usually takes around 3m to provision/)).toBeTruthy();
  });

  it('NEEDS_SESSION: Start button is disabled while starting=true', () => {
    renderPanel('NEEDS_SESSION', { starting: true });
    const startBtn = screen.getByRole('button', { name: /Starting/i }) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
  });

  it('PROVISIONING: shows badge + Cancel button', () => {
    const { onStopRequest } = renderPanel('PROVISIONING', {
      session: { ...mockSession, status: 'provisioning' },
    });
    expect(screen.getByText('Starting…')).toBeTruthy();
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn);
    expect(onStopRequest).toHaveBeenCalledOnce();
  });

  it('PROVISIONING: renders without raw status telemetry', () => {
    renderPanel('PROVISIONING', { session: { ...mockSession, status: 'provisioning' } });
    expect(screen.getByText('Starting…')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeTruthy();
  });

  it('STALE: shows badge + Stop button', () => {
    const { onStopRequest } = renderPanel('STALE', {
      session: { ...mockSession, status: 'stale', error_message: 'Connection lost' },
    });
    expect(screen.getByText('Session unreachable')).toBeTruthy();
    expect(screen.getByText('Connection lost')).toBeTruthy();
    const stopBtn = screen.getByRole('button', { name: /Stop session/i });
    fireEvent.click(stopBtn);
    expect(onStopRequest).toHaveBeenCalledOnce();
  });

  it('STOPPING: shows badge, no button', () => {
    renderPanel('STOPPING');
    expect(screen.getByText('Stopping…')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('SIGN_IN_REQUIRED: shows badge + Sign in link, no Start/Stop button', () => {
    renderPanel('SIGN_IN_REQUIRED');
    expect(screen.getByText('Sign in to use')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Sign in/i });
    expect(link).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('UNAVAILABLE: shows badge, no button', () => {
    renderPanel('UNAVAILABLE');
    expect(screen.getByText('Temporarily unavailable')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('PAUSED: shows paused note + escape link, no button', () => {
    renderPanel('PAUSED');
    expect(screen.getByText('Session is paused.')).toBeTruthy();
    const escapeLink = screen.getByRole('link', { name: /Manage in Sessions/i });
    expect(escapeLink).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
