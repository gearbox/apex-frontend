import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
import { makeArtist } from '../../../../../../mocks/factories/studio';
import { clearAuth, setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../../../../mocks/factories/user';
import QueryHarness from '../../../../../../tests/QueryHarness.svelte';
import type { Component } from 'svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));

import { goto } from '$app/navigation';
import Page from './+page.svelte';

const tokens = {
  accessToken: 'artists-create-access',
  refreshToken: 'artists-create-refresh',
  expiresAt: '2030-01-01T00:15:00.000Z',
  contentCookieExpiresAt: '2030-01-02T00:00:00.000Z',
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  return client;
}

beforeEach(() => {
  clearAuth();
  setAuth(tokens, makeUserProfile());
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  clearAuth();
});

describe('new artist page', () => {
  it('starts with no chip selected, preserves edited persona copy, and posts no chip kind', async () => {
    let postedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/v1/studio/artists`, async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeArtist({ id: 'artist-created', name: 'Iris Vale' }), {
          status: 201,
        });
      }),
    );
    renderPage();

    const group = await screen.findByRole('radiogroup', { name: 'Start with a kind of artist' });
    const human = screen.getByRole('radio', { name: 'Human' });
    const spirit = screen.getByRole('radio', { name: 'Spirit' });
    const persona = screen.getByLabelText('Persona') as HTMLTextAreaElement;
    expect(
      screen.getAllByRole('radio').every((chip) => chip.getAttribute('aria-checked') === 'false'),
    ).toBe(true);

    await fireEvent.click(human);
    expect(persona.value).toContain('Who is this person?');
    await fireEvent.click(spirit);
    expect(persona.value).toContain('what keeps it here');
    await fireEvent.input(persona, {
      target: { value: 'A spirit who keeps the old station lit.' },
    });
    await fireEvent.click(human);
    expect(persona.value).toBe('A spirit who keeps the old station lit.');

    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Iris Vale' } });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create and write the first memory' }),
    );
    await waitFor(() => expect(postedBody).toBeDefined());

    expect(postedBody).toEqual({
      name: 'Iris Vale',
      persona: 'A spirit who keeps the old station lit.',
    });
    expect(postedBody).not.toHaveProperty('kind');
    expect(goto).toHaveBeenCalledWith('/app/artists/artist-created?compose=1');
    expect(group).toBeTruthy();
  });

  it('maps name conflicts and displays every document validation issue', async () => {
    server.use(
      http.post(`${BASE}/v1/studio/artists`, () =>
        HttpResponse.json(
          {
            error: 'document_invalid',
            message: 'Invalid artist',
            status_code: 422,
            detail: {
              issues: [
                { path: 'name', code: 'too_long_after_normalization' },
                { path: 'persona', code: 'empty_after_normalization' },
              ],
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderPage();
    await screen.findByLabelText('Name');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'A name' } });
    await fireEvent.input(screen.getByLabelText('Persona'), { target: { value: 'A persona' } });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create and write the first memory' }),
    );

    expect(await screen.findByText('name: too long after normalization')).toBeTruthy();
    expect(screen.getByText('persona: empty after normalization')).toBeTruthy();

    cleanup();
    const conflictClient = renderPage();
    server.use(
      http.post(`${BASE}/v1/studio/artists`, () =>
        HttpResponse.json(
          { error: 'artist_name_conflict', message: 'Name conflict', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    await screen.findByLabelText('Name');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Taken' } });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create and write the first memory' }),
    );
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'An artist with this name already exists.',
    );
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    conflictClient.clear();
  });

  it('disables the form when the server reports the 50-artist limit', async () => {
    server.use(
      http.post(`${BASE}/v1/studio/artists`, () =>
        HttpResponse.json(
          { error: 'artist_limit_reached', message: 'Artist cap', status_code: 409 },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    await screen.findByLabelText('Name');
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Another artist' } });
    await fireEvent.click(
      screen.getByRole('button', { name: 'Create and write the first memory' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'You can have up to 50 artists.',
    );
    expect(screen.queryByRole('button', { name: 'Create and write the first memory' })).toBeNull();
  });
});
