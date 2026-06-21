import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import CreateSessionPanel from './CreateSessionPanel.svelte';
import type { CardState } from '$lib/utils/sessionState';

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
  create_session_cost_hint: () => 'Billed by the hour.',
  create_session_uptime: () => 'Uptime',
  create_session_cost_so_far: () => 'Cost so far:',
  create_session_manage_link: () => 'Manage in Sessions',
}));

vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

const mockSession = {
  id: 'sess_001',
  user_id: 'usr_001',
  product_id: 'prod_001',
  status: 'active' as const,
  model_type: 'aisha-image',
  bundle_name: 'aisha-bundle',
  bundle_version: '1.0.0',
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
  provisioning_phase: null,
  provisioning_progress: null,
};

function renderPanel(
  cardState: CardState,
  overrides: Partial<ComponentProps<typeof CreateSessionPanel>> = {},
) {
  const onStart = vi.fn();
  const onStopRequest = vi.fn();
  const { container } = render(CreateSessionPanel, {
    props: {
      cardState,
      session: null,
      starting: false,
      onStart,
      onStopRequest,
      ...overrides,
    },
  });
  return { container, onStart, onStopRequest };
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

  it('NEEDS_SESSION: shows badge + hint + Start button', () => {
    const { onStart } = renderPanel('NEEDS_SESSION');
    expect(screen.getByText('Needs GPU session')).toBeTruthy();
    expect(screen.getByText('Billed by the hour.')).toBeTruthy();
    const startBtn = screen.getByRole('button', { name: /Start session/i });
    expect(startBtn).toBeTruthy();
    fireEvent.click(startBtn);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('NEEDS_SESSION: Start button is disabled while starting=true', () => {
    renderPanel('NEEDS_SESSION', { starting: true });
    const startBtn = screen.getByRole('button', { name: /Starting/i }) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
  });

  it('PROVISIONING: shows badge + Cancel button', () => {
    const { onStopRequest } = renderPanel('PROVISIONING', {
      session: { ...mockSession, status: 'provisioning', provisioning_phase: 'downloading' },
    });
    expect(screen.getByText('Starting…')).toBeTruthy();
    expect(screen.getByText('downloading')).toBeTruthy();
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn);
    expect(onStopRequest).toHaveBeenCalledOnce();
  });

  it('PROVISIONING: no provisioning_phase renders fine without hint', () => {
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

  it('PAUSED_HIDDEN: shows paused note + escape link, no button', () => {
    renderPanel('PAUSED_HIDDEN');
    expect(screen.getByText('Session is paused.')).toBeTruthy();
    const escapeLink = screen.getByRole('link', { name: /Manage in Sessions/i });
    expect(escapeLink).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
