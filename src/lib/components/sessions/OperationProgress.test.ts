import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

let operation: Record<string, unknown> | undefined;

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: () => ({ getQueryData: vi.fn() }),
  createQuery: () => ({
    get data() {
      return operation;
    },
  }),
}));
vi.mock('$lib/stores/eventStream', () => ({
  isSSEFallback: {
    subscribe: (run: (value: boolean) => void) => {
      run(false);
      return () => {};
    },
  },
}));
vi.mock('$paraglide/messages', () => ({
  operation_status_queued: () => 'Queued',
  operation_status_running: () => 'Working',
  operation_status_succeeded: () => 'Complete',
  operation_status_failed: () => 'Failed',
  operation_phase_preflight: () => 'Preparing',
  operation_phase_comfyui: () => 'ComfyUI',
  operation_phase_requirements_base: () => 'Base requirements',
  operation_phase_requirements_locked: () => 'Locked requirements',
  operation_phase_custom_nodes: () => 'Custom nodes',
  operation_phase_models: () => 'Downloading models',
  operation_phase_workflow: () => 'Workflow',
  operation_phase_verifying: () => 'Verifying',
  operation_phase_restart: () => 'Restarting',
  operation_progress_label: () => 'Operation progress',
  operation_waiting_for_progress: () => 'Waiting for progress…',
  operation_loading: () => 'Loading operation…',
  operation_work_downloaded: ({ completed, total }: { completed: string; total: string }) =>
    `Downloaded ${completed} / ${total}`,
  operation_work_downloaded_unknown: ({ completed }: { completed: string }) =>
    `Downloaded ${completed}`,
  operation_work_files: ({ completed, total }: { completed: string; total: string }) =>
    `Files ${completed} / ${total}`,
  operation_work_files_unknown: ({ completed }: { completed: string }) => `Files ${completed}`,
  operation_work_items: ({ completed, total }: { completed: string; total: string }) =>
    `Processed ${completed} items / ${total}`,
  operation_work_items_unknown: ({ completed }: { completed: string }) =>
    `Processed ${completed} items`,
  operation_rate: ({ rate }: { rate: string }) => rate,
  operation_eta: ({ time }: { time: string }) => `${time} remaining`,
  operation_elapsed: ({ time }: { time: string }) => `Elapsed ${time}`,
  operation_typical_duration: ({ time }: { time: string }) => `Usually around ${time}`,
}));

import OperationProgress from './OperationProgress.svelte';

const baseOperation = {
  id: 'op_001',
  session_id: 'sess_001',
  deployment_id: null,
  kind: 'bundle_provision',
  revision: 0,
  target: null,
  message: null,
  error: null,
  started_at: null,
  updated_at: '2026-09-10T00:00:00Z',
  finished_at: null,
};

describe('OperationProgress', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders queued revision zero as a valid operation without a synthetic ETA', () => {
    operation = { ...baseOperation, status: 'queued', phase: null, progress: null };
    render(OperationProgress, {
      props: { sessionId: 'sess_001', operationId: 'op_001', typicalAttachSeconds: 120 },
    });
    expect(screen.getByText('Queued')).toBeTruthy();
    expect(screen.getByText('Waiting for progress…')).toBeTruthy();
    expect(screen.getByText('Usually around 2m')).toBeTruthy();
    expect(screen.queryByText(/remaining/)).toBeNull();
  });

  it('uses typed live telemetry for progress, work, throughput, and ETA', () => {
    operation = {
      ...baseOperation,
      status: 'running',
      phase: 'models',
      progress: {
        progress_pct: 100,
        work: { completed: 6 * 1024 ** 3, total: 5.1 * 1024 ** 3, unit: 'bytes' },
        items: { completed: 3, total: null, unit: 'items' },
        rate: { value: 42 * 1024 ** 2, unit: 'bytes_per_second' },
        eta_seconds: 103,
      },
    };
    render(OperationProgress, { props: { sessionId: 'sess_001', operationId: 'op_001' } });
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('Downloading models')).toBeTruthy();
    expect(screen.getByText('Downloaded 6 GB / 5.1 GB')).toBeTruthy();
    expect(screen.getByText('Processed 3 items')).toBeTruthy();
    expect(screen.getByText('42 MB/s')).toBeTruthy();
    expect(screen.getByText('1m 43s remaining')).toBeTruthy();
  });

  it('surfaces the persisted safe failure message', () => {
    operation = {
      ...baseOperation,
      status: 'failed',
      phase: null,
      progress: null,
      error: { message: 'Bundle download failed' },
    };
    render(OperationProgress, { props: { sessionId: 'sess_001', operationId: 'op_001' } });
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Bundle download failed')).toBeTruthy();
  });

  it('advances a local elapsed display without deriving an ETA', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:00:42Z'));
    operation = {
      ...baseOperation,
      status: 'running',
      phase: null,
      progress: null,
      started_at: '2026-09-10T00:00:00Z',
    };

    render(OperationProgress, { props: { sessionId: 'sess_001', operationId: 'op_001' } });
    expect(screen.getByText('Elapsed 42s')).toBeTruthy();

    await tick();
    vi.advanceTimersByTime(1000);
    await tick();
    expect(screen.getByText('Elapsed 43s')).toBeTruthy();
    expect(screen.queryByText(/remaining/)).toBeNull();
  });

  it('selects bootstrap and attach hints from the operation context', () => {
    operation = {
      ...baseOperation,
      kind: 'session_bootstrap',
      status: 'queued',
      phase: null,
      progress: null,
    };
    const bootstrap = render(OperationProgress, {
      props: {
        sessionId: 'sess_001',
        operationId: 'op_001',
        typicalBootstrapSeconds: 180,
        typicalAttachSeconds: 60,
      },
    });
    expect(screen.getByText('Usually around 3m')).toBeTruthy();
    bootstrap.unmount();

    operation = {
      ...baseOperation,
      kind: 'bundle_provision',
      status: 'queued',
      phase: null,
      progress: null,
    };
    render(OperationProgress, {
      props: {
        sessionId: 'sess_001',
        operationId: 'op_001',
        typicalBootstrapSeconds: 180,
        typicalAttachSeconds: 60,
      },
    });
    expect(screen.getByText('Usually around 1m')).toBeTruthy();
  });

  it('freezes elapsed time for terminal operations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:02:00Z'));
    operation = {
      ...baseOperation,
      status: 'succeeded',
      phase: null,
      progress: null,
      started_at: '2026-09-10T00:00:00Z',
      finished_at: '2026-09-10T00:00:42Z',
    };

    render(OperationProgress, { props: { sessionId: 'sess_001', operationId: 'op_001' } });
    expect(screen.getByText('Elapsed 42s')).toBeTruthy();
    await tick();
    vi.advanceTimersByTime(60_000);
    await tick();
    expect(screen.getByText('Elapsed 42s')).toBeTruthy();
  });
});
