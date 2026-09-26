import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { legalKeys } from '$lib/queries/legal';
import { resetLegalState } from '$lib/stores/legal';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import Page from './+page.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

const submitButton = () =>
  screen.getByRole('button', { name: /create account|sign up/i }) as HTMLButtonElement;

beforeEach(() => resetLegalState());
afterEach(() => cleanup());

describe('register page — legal acceptance', () => {
  it('keeps submit disabled while /current is refetching', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(QueryHost, { props: hostProps(queryClient, Page, {}) });

    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0));
    for (const checkbox of screen.getAllByRole('checkbox')) await fireEvent.click(checkbox);
    await waitFor(() => expect(submitButton().disabled).toBe(false));

    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fresh = await (await fetch(`${BASE}/v1/legal/current`)).json();
    server.use(
      http.get(`${BASE}/v1/legal/current`, async () => {
        await gate;
        return HttpResponse.json(fresh);
      }),
    );
    void queryClient.refetchQueries({ queryKey: legalKeys.current() });

    await waitFor(() => expect(submitButton().disabled).toBe(true));
    release();
    await waitFor(() => expect(submitButton().disabled).toBe(false));
  });
});
