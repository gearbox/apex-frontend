import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import HealthTimeline from './HealthTimeline.svelte';
import { makeHealthSnapshotResponse } from '../../../mocks/factories/admin';

describe('HealthTimeline', () => {
  it('renders N rects for N snapshots', () => {
    const snapshots = [
      makeHealthSnapshotResponse({ overall_status: 'healthy', checked_at: '2026-01-01T00:00:00Z' }),
      makeHealthSnapshotResponse({
        overall_status: 'degraded',
        checked_at: '2026-01-01T00:01:00Z',
      }),
      makeHealthSnapshotResponse({
        overall_status: 'unhealthy',
        checked_at: '2026-01-01T00:02:00Z',
      }),
    ];
    const { container: c } = render(HealthTimeline, { props: { snapshots } });
    const rects = c.querySelectorAll('rect');
    expect(rects.length).toBe(3);
  });

  it('applies correct fill colors per status', () => {
    const snapshots = [
      makeHealthSnapshotResponse({ overall_status: 'healthy' }),
      makeHealthSnapshotResponse({ overall_status: 'degraded' }),
      makeHealthSnapshotResponse({ overall_status: 'unhealthy' }),
      makeHealthSnapshotResponse({ overall_status: 'unknown' }),
    ];
    const { container: c } = render(HealthTimeline, { props: { snapshots } });
    const rects = c.querySelectorAll('rect');
    // Reversed (chronological order), but all 4 should be rendered
    expect(rects.length).toBe(4);
    const fills = Array.from(rects).map((r) => r.getAttribute('fill'));
    expect(fills).toContain('var(--apex-success)');
    expect(fills).toContain('var(--apex-warning)');
    expect(fills).toContain('var(--apex-danger)');
    expect(fills).toContain('var(--apex-text-dim)');
  });

  it('renders empty state when snapshots array is empty', () => {
    const { queryByRole, getByText } = render(HealthTimeline, { props: { snapshots: [] } });
    expect(queryByRole('img')).toBeNull();
    expect(getByText(/no history data/i)).toBeTruthy();
  });

  it('has role="img" and aria-label on svg', () => {
    const snapshots = [
      makeHealthSnapshotResponse({ overall_status: 'healthy' }),
      makeHealthSnapshotResponse({ overall_status: 'healthy' }),
    ];
    const { container: c } = render(HealthTimeline, { props: { snapshots } });
    const svg = c.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toMatch(/system status/i);
  });

  it('each rect has a title tooltip', () => {
    const snapshots = [
      makeHealthSnapshotResponse({ overall_status: 'healthy', checked_at: '2026-01-01T00:00:00Z' }),
    ];
    const { container: c } = render(HealthTimeline, { props: { snapshots } });
    const title = c.querySelector('rect title');
    expect(title?.textContent).toMatch(/healthy/i);
  });
});
