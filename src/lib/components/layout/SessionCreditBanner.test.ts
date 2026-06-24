import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { formatCountdown } from '$lib/utils/format';
import { upsertCreditWarning, dismissAllCreditWarnings } from '$lib/stores/creditWarnings';
import SessionCreditBanner from './SessionCreditBanner.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$paraglide/messages', () => ({
  credit_banner_warning: ({ time }: { time: string }) => `Running low — stops in ${time}. Top up.`,
  credit_banner_critical: ({ time }: { time: string }) =>
    `Critical — stops in ${time}! Top up now.`,
  credit_banner_stopping: () => 'Out of credits — stopping…',
  credit_banner_cta_topup: () => 'Top up',
  credit_banner_dismiss: () => 'Dismiss credit warning',
}));

vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

beforeEach(() => {
  dismissAllCreditWarnings();
});

/* ─── formatCountdown unit tests ─── */

describe('formatCountdown()', () => {
  it('formats minutes and seconds as MM:SS', () => {
    expect(formatCountdown(5 * 60_000 + 23_000)).toBe('05:23');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(60_000)).toBe('01:00');
    expect(formatCountdown(90_000)).toBe('01:30');
    expect(formatCountdown(3600_000)).toBe('60:00');
  });

  it('clamps negative values to 00:00', () => {
    expect(formatCountdown(-1000)).toBe('00:00');
    expect(formatCountdown(-999_999)).toBe('00:00');
  });
});

/* ─── Component rendering tests ─── */

describe('SessionCreditBanner — not rendered when no warning', () => {
  it('renders nothing when store is empty', () => {
    const { container } = render(SessionCreditBanner);
    expect(container.querySelector('[role]')).toBeNull();
  });
});

describe('SessionCreditBanner — warning level', () => {
  it('renders with role=status and aria-live=polite for warning level', () => {
    upsertCreditWarning({
      session_id: 'sess_w',
      level: 'warning',
      minutes_remaining: 5,
      terminate_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      balance: 50,
    });
    render(SessionCreditBanner);
    const el = document.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });
});

describe('SessionCreditBanner — critical level', () => {
  it('renders with role=alert and aria-live=assertive for critical level', () => {
    upsertCreditWarning({
      session_id: 'sess_c',
      level: 'critical',
      minutes_remaining: 2,
      terminate_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      balance: 10,
    });
    render(SessionCreditBanner);
    const el = document.querySelector('[role="alert"]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('aria-live')).toBe('assertive');
  });
});

describe('SessionCreditBanner — stopping state (null terminate_at)', () => {
  it('shows stopping copy when terminate_at is null', () => {
    upsertCreditWarning({
      session_id: 'sess_s',
      level: 'critical',
      minutes_remaining: 0,
      terminate_at: null,
      balance: -5,
    });
    render(SessionCreditBanner);
    expect(screen.getAllByText(/stopping/i).length).toBeGreaterThan(0);
  });
});

describe('SessionCreditBanner — top-up CTA', () => {
  it('renders the top-up button', () => {
    upsertCreditWarning({
      session_id: 'sess_cta',
      level: 'warning',
      minutes_remaining: 8,
      terminate_at: new Date(Date.now() + 8 * 60_000).toISOString(),
      balance: 40,
    });
    render(SessionCreditBanner);
    const btn = screen.getByRole('button', { name: /top up/i });
    expect(btn).not.toBeNull();
  });

  it('calls goto(/app/billing/buy) on CTA click', async () => {
    const { goto } = await import('$app/navigation');
    upsertCreditWarning({
      session_id: 'sess_goto',
      level: 'warning',
      minutes_remaining: 8,
      terminate_at: new Date(Date.now() + 8 * 60_000).toISOString(),
      balance: 40,
    });
    render(SessionCreditBanner);
    const btn = screen.getByRole('button', { name: /top up/i });
    btn.click();
    expect(goto).toHaveBeenCalledWith('/app/billing/buy');
  });
});
