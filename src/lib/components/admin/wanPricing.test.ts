import type { ComponentProps } from 'svelte';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { makePricingRule, makeGenerationModel } from '../../../mocks/factories/admin';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import PricingRuleModal from './PricingRuleModal.svelte';
const base = 'http://localhost:8000';
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  server.use(
    http.get(`${base}/v1/admin/models`, () =>
      HttpResponse.json({
        items: [
          makeGenerationModel({ model_key: 'wan3.0-video', provider: 'alibaba', name: 'Wan 3.0' }),
        ],
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
});
async function open(mode = 'r2v') {
  render(QueryHarness<ComponentProps<typeof PricingRuleModal>>, {
    client,
    component: PricingRuleModal,
    componentProps: { queryClient: client, onclose: vi.fn() },
  });
  await screen.findByRole('option', { name: 'alibaba' });
  await fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'alibaba' } });
  await fireEvent.change(screen.getByLabelText('Generation Type'), { target: { value: mode } });
  await fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'wan3.0-video' } });
}
it('sends every single-rule pricing field', async () => {
  let body: Record<string, unknown> | null = null;
  server.use(
    http.post(`${base}/v1/admin/pricing`, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(makePricingRule(), { status: 201 });
    }),
  );
  await open();
  await fireEvent.input(screen.getByLabelText('Token Cost'), { target: { value: '0' } });
  await fireEvent.input(screen.getByLabelText('Tokens per input image'), {
    target: { value: '2' },
  });
  await fireEvent.input(screen.getByLabelText('Tokens per second'), { target: { value: '4' } });
  await fireEvent.change(screen.getByLabelText('Resolution'), { target: { value: '1080p' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(body).toMatchObject({
      generation_type: 'r2v',
      per_second_token_cost: 4,
      video_resolution: '1080p',
      input_token_cost: 2,
      token_cost: 0,
    }),
  );
});
it('creates three resolution rows sequentially and retries only the failed row', async () => {
  const requests: string[] = [];
  let active = 0;
  let concurrent = false;
  server.use(
    http.post(`${base}/v1/admin/pricing`, async ({ request }) => {
      active++;
      if (active > 1) concurrent = true;
      const body = (await request.json()) as { video_resolution: string };
      requests.push(body.video_resolution);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (body.video_resolution === '720p' && requests.length === 2)
        return HttpResponse.json(
          { error: 'invalid_pricing_rule', message: 'Console price invalid', status_code: 422 },
          { status: 422 },
        );
      return HttpResponse.json(makePricingRule(), { status: 201 });
    }),
  );
  await open();
  await fireEvent.click(screen.getByLabelText('One rule per resolution'));
  for (const resolution of ['480p', '720p', '1080p'])
    await fireEvent.input(screen.getByLabelText(resolution), { target: { value: '3' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(/Console price invalid/);
  await waitFor(() => expect(screen.getAllByText(/✓ Created/)).toHaveLength(2));
  expect(requests).toEqual(['480p', '720p', '1080p']);
  expect(concurrent).toBe(false);
  await fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));
  await waitFor(() => expect(screen.getAllByText(/✓ Created/)).toHaveLength(3));
  expect(requests).toEqual(['480p', '720p', '1080p', '720p']);
});
it('keeps resolution read-only on edit', () => {
  render(QueryHarness<ComponentProps<typeof PricingRuleModal>>, {
    client,
    component: PricingRuleModal,
    componentProps: {
      queryClient: client,
      rule: makePricingRule({ generation_type: 'r2v', video_resolution: '720p' }),
      onclose: vi.fn(),
    },
  });
  expect((screen.getByLabelText('Resolution') as HTMLSelectElement).disabled).toBe(true);
  expect(screen.queryByLabelText('One rule per resolution')).toBeNull();
});
