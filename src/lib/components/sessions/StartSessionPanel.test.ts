import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import StartSessionPanel from './StartSessionPanel.svelte';

type ModelOption = ComponentProps<typeof StartSessionPanel>['onDemandModels'][number];

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
    })),
  };
});

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

vi.mock('$paraglide/messages', () => ({
  sessions_start_heading: () => 'Start a Session',
  sessions_empty: () => 'No active sessions. Start one below.',
  sessions_start_model_label: () => 'Model',
  sessions_provider_unavailable: () => 'Temporarily unavailable',
  sessions_start_cta: () => 'Start Session',
  common_loading: () => 'Loading…',
  generate_btn_topup: () => 'Top up to generate',
  gpu_session_start_hint_with_time: ({ time }: { time: string }) =>
    `This model usually takes around ${time} to provision. Billed by the minute, with a 5-minute minimum.`,
  gpu_session_start_hint_without_time: () => 'Billed by the minute, with a 5-minute minimum.',
}));

vi.mock('$paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'en'),
  setLocale: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

const models: ModelOption[] = [
  {
    model_key: 'model-a',
    name: 'Model A',
    available: true,
    typicalBootstrapSeconds: 600,
  },
  {
    model_key: 'model-b',
    name: 'Model B',
    available: true,
    typicalBootstrapSeconds: 180,
  },
];

function renderPanel(
  onDemandModels: ModelOption[] = models,
  onStart: (model: string) => void = vi.fn(),
) {
  return render(StartSessionPanel, {
    props: { onDemandModels, starting: false, onStart },
  });
}

describe('StartSessionPanel', () => {
  it('uses the selected model bootstrap hint and updates it immediately on selection', async () => {
    renderPanel();

    expect(screen.getByText(/This model usually takes around 10m to provision/)).toBeTruthy();

    await fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });

    expect(screen.getByText(/This model usually takes around 3m to provision/)).toBeTruthy();
    expect(screen.queryByText(/10m/)).toBeNull();
  });

  it('uses billing-only fallback when the selected model has no bootstrap hint', () => {
    renderPanel([
      {
        model_key: 'model-a',
        name: 'Model A',
        available: true,
        typicalBootstrapSeconds: null,
      },
    ]);

    expect(screen.getByText('Billed by the minute, with a 5-minute minimum.')).toBeTruthy();
    expect(screen.queryByText(/provision/)).toBeNull();
    expect(screen.queryByText(/30–90/)).toBeNull();
  });

  it('falls back to a current model when the selected model disappears', async () => {
    const onStart = vi.fn();
    const rendered = renderPanel(models, onStart);

    await fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });
    expect(screen.getByText(/3m/)).toBeTruthy();

    await rendered.rerender({ onDemandModels: [models[0]], starting: false, onStart });

    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(select.value).toBe('model-a');
    expect(screen.getByText(/10m/)).toBeTruthy();
    const startButton = screen.getByRole('button', { name: 'Start Session' }) as HTMLButtonElement;
    expect(startButton.disabled).toBe(false);
    await fireEvent.click(startButton);
    expect(onStart).toHaveBeenCalledWith('model-a');
  });

  it('recovers from an empty model list after a selected model disappears', async () => {
    const onStart = vi.fn();
    const rendered = renderPanel(models, onStart);

    await fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'model-b' } });
    await rendered.rerender({ onDemandModels: [], starting: false, onStart });

    expect(screen.getByText('No active sessions. Start one below.')).toBeTruthy();
    expect(screen.queryByLabelText('Model')).toBeNull();

    await rendered.rerender({ onDemandModels: [models[0]], starting: false, onStart });

    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(select.value).toBe('model-a');
    expect(screen.getByText(/10m/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Start Session' }));
    expect(onStart).toHaveBeenCalledWith('model-a');
  });

  it('preserves the unavailable-provider hint without showing a provisioning duration', () => {
    renderPanel([
      {
        model_key: 'unavailable-model',
        name: 'Unavailable model',
        available: false,
        typicalBootstrapSeconds: 600,
      },
    ]);

    expect(screen.getByText('Temporarily unavailable')).toBeTruthy();
    expect(screen.queryByText(/10m/)).toBeNull();
  });
});
