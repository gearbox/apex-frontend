import { describe, it, expect } from 'vitest';
import { makeDeploymentMutationResponse, makeOperationResponse } from './session';

describe('makeDeploymentMutationResponse()', () => {
  it('embeds the overridden operation in deployment.current_operation', () => {
    const response = makeDeploymentMutationResponse({
      operation: makeOperationResponse({
        id: 'op_remove',
        revision: 7,
        status: 'running',
      }),
    });

    expect(response.deployment.current_operation?.id).toBe('op_remove');
    expect(response.deployment.current_operation?.revision).toBe(7);
    expect(response.deployment.current_operation?.status).toBe('running');

    expect(response.deployment.current_operation).toEqual(response.operation);
  });

  it('keeps deployment.current_operation consistent with operation by default', () => {
    const response = makeDeploymentMutationResponse();

    expect(response.deployment.current_operation).toEqual(response.operation);
  });

  it('re-derives current_operation to match operation even when a deployment override supplies its own', () => {
    const response = makeDeploymentMutationResponse({
      deployment: {
        id: 'deploy_target',
        model_type: 'aisha-image',
        bundle_name: 'aisha',
        bundle_version: null,
        status: 'removing',
        pending_restart: false,
        routing_suspended: false,
        is_primary: true,
        created_at: '2026-06-20T00:00:00Z',
        activated_at: '2026-06-20T00:01:00Z',
        current_operation: makeOperationResponse({ id: 'op_stale', kind: 'bundle_provision' }),
      },
      operation: makeOperationResponse({ id: 'op_remove', kind: 'bundle_removal' }),
    });

    expect(response.deployment.id).toBe('deploy_target');
    expect(response.deployment.current_operation?.id).toBe('op_remove');
    expect(response.deployment.current_operation).toEqual(response.operation);
  });
});
