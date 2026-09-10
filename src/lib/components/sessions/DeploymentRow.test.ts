import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DeploymentRow from './DeploymentRow.svelte';

const deployment = (status: string) =>
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
    expect(screen.queryByRole('button', { name: 'Remove' }) !== null).toBe(expected);
  });
});
