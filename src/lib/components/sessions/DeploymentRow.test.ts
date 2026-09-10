import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DeploymentRow from './DeploymentRow.svelte';

const deployment = (status: string, overrides: Record<string, unknown> = {}) =>
  ({
    id: 'deploy_001',
    model_type: 'aisha-image',
    bundle_name: 'aisha',
    bundle_version: null,
    status,
    pending_restart: false,
    routing_suspended: false,
    is_primary: true,
    created_at: '2026-06-20T00:00:00Z',
    activated_at: null,
    ...overrides,
  }) as never;

describe('DeploymentRow removal controls', () => {
  it.each([
    ['active', 'active', true],
    ['active', 'deploying', false],
    ['active', 'removing', false],
    ['active', 'removed', false],
    ['active', 'failed', false],
    ['paused', 'active', false],
    ['stale', 'active', false],
    ['resuming', 'active', false],
    ['stopping', 'active', false],
  ])('renders Remove for session %s and deployment %s: %s', (sessionStatus, status, expected) => {
    render(DeploymentRow, {
      props: {
        sessionId: 'sess_001',
        sessionStatus: sessionStatus as never,
        deployment: deployment(status),
        modelName: 'Aisha',
        onRemove: vi.fn(),
      },
    });
    expect(screen.queryByRole('button', { name: 'Remove Aisha' }) !== null).toBe(expected);
  });

  it('gives each row a model-specific accessible name while keeping visible text unchanged', () => {
    const { container } = render(DeploymentRow, {
      props: {
        sessionId: 'sess_001',
        sessionStatus: 'active' as never,
        deployment: deployment('active', { model_type: 'aisha-image' }),
        modelName: 'Aisha Image',
        onRemove: vi.fn(),
      },
    });
    render(DeploymentRow, {
      props: {
        sessionId: 'sess_001',
        sessionStatus: 'active' as never,
        deployment: deployment('active', { id: 'deploy_002', model_type: 'aisha-image-lite' }),
        modelName: 'Aisha Lite',
        onRemove: vi.fn(),
      },
    });

    const first = screen.getByRole('button', { name: 'Remove Aisha Image' });
    const second = screen.getByRole('button', { name: 'Remove Aisha Lite' });
    expect(first).not.toBe(second);
    // Visible text is unchanged even though the accessible name is now model-specific.
    expect(container.querySelector('.remove')?.textContent).toBe('Remove');
  });
});
