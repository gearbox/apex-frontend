import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../mocks/config';
import { makeProjectProfile, makeTrack } from '../../../../../../../mocks/factories/studio';
import { createTrackMutationOptions } from '$lib/queries/studioTracks';
const state = vi.hoisted(() => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$app/navigation', () => ({ goto: state.goto }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ params: { projectId: 'p' }, url: new URL('http://localhost/app/studio/p/settings') });
      return () => {};
    },
  },
}));
import Page from './+page.svelte';
afterEach(() => {
  cleanup();
  state.goto.mockClear();
  vi.restoreAllMocks();
});
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  return client;
}
function requestGate() {
  let release!: () => void;
  let start!: () => void;
  const started = new Promise<void>((resolve) => (start = resolve));
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { started, start, wait, release: () => release() };
}
it('a successful save announces it without renaming an unchanged name', async () => {
  const profile = makeProjectProfile({ library_project_id: 'p', name: 'Release' });
  let patchCount = 0;
  let putCount = 0;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () => HttpResponse.json(profile)),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, () => {
      patchCount++;
      return HttpResponse.json({});
    }),
    http.put(`${BASE}/v1/studio/projects/p`, () => {
      putCount++;
      return HttpResponse.json(profile);
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(putCount).toBe(1));
  expect(patchCount).toBe(0);
  expect((await screen.findByRole('status')).textContent).toContain('Saved.');
  client.clear();
});
it('a name edited while the rename is pending is saved by the next Save', async () => {
  let releaseRename!: () => void;
  let renameStarted!: () => void;
  const renameGate = new Promise<void>((resolve) => {
    releaseRename = resolve;
  });
  const renameRequested = new Promise<void>((resolve) => {
    renameStarted = resolve;
  });
  let libraryName = 'Release';
  const patches: string[] = [];
  const profiles: Array<{
    release_kind: string;
    artist_id: string | null;
    concept: string | null;
  }> = [];
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: libraryName, concept: 'Original' }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      patches.push(body.name);
      renameStarted();
      await renameGate;
      libraryName = body.name;
      return HttpResponse.json({ id: 'p', name: body.name });
    }),
    http.put(`${BASE}/v1/studio/projects/p`, async ({ request }) => {
      const body = (await request.json()) as {
        release_kind: 'single' | 'ep' | 'album';
        artist_id: string | null;
        concept: string | null;
      };
      profiles.push(body);
      return HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: libraryName, ...body }),
      );
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const name = screen.getByLabelText(/Project name/) as HTMLInputElement;
  await fireEvent.input(name, { target: { value: 'B' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await renameRequested;
  await fireEvent.input(name, { target: { value: 'C' } });
  releaseRename();
  await waitFor(() => expect(profiles).toHaveLength(1));
  const saveButton = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  await waitFor(() => expect(saveButton.disabled).toBe(false));
  expect(profiles[0].concept).toBe('Original');
  expect(screen.queryByRole('status')).toBeNull();

  await fireEvent.click(saveButton);
  await waitFor(() => expect(profiles).toHaveLength(2));
  await waitFor(() => expect(saveButton.disabled).toBe(false));
  await waitFor(() => expect(patches).toEqual(['B', 'C']));
  expect((await screen.findByRole('status')).textContent).toContain('Saved.');
  client.clear();
});
it('Save stays disabled for the whole save, even after editing', async () => {
  let releaseRename!: () => void;
  let renameStarted!: () => void;
  const renameGate = new Promise<void>((resolve) => (releaseRename = resolve));
  const renameRequested = new Promise<void>((resolve) => (renameStarted = resolve));
  const patches: string[] = [];
  let libraryName = 'Release';
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: libraryName })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      patches.push(body.name);
      renameStarted();
      await renameGate;
      libraryName = body.name;
      return HttpResponse.json({ id: 'p', name: body.name });
    }),
    http.put(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: libraryName })),
    ),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const name = screen.getByLabelText(/Project name/) as HTMLInputElement;
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  await fireEvent.input(name, { target: { value: 'B' } });
  await fireEvent.click(save);
  await renameRequested;
  await fireEvent.input(name, { target: { value: 'C' } });
  expect(save.disabled).toBe(true);
  await fireEvent.click(save);
  expect(patches).toEqual(['B']);
  releaseRename();
  await waitFor(() => expect(save.disabled).toBe(false));
  expect(patches).toEqual(['B']);
  expect(libraryName).toBe('B');
  client.clear();
});
it('Save stays disabled while the profile update is pending, even after editing', async () => {
  let releaseProfile!: () => void;
  let profileStarted!: () => void;
  const profileGate = new Promise<void>((resolve) => (releaseProfile = resolve));
  const profileRequested = new Promise<void>((resolve) => (profileStarted = resolve));
  let puts = 0;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Release', concept: 'Original' }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.put(`${BASE}/v1/studio/projects/p`, async ({ request }) => {
      puts++;
      await request.json();
      profileStarted();
      await profileGate;
      return HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Release', concept: 'Submitted' }),
      );
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const concept = screen.getByLabelText(/Concept/) as HTMLTextAreaElement;
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  await fireEvent.input(concept, { target: { value: 'Submitted' } });
  await fireEvent.click(save);
  await profileRequested;
  await fireEvent.input(concept, { target: { value: 'Later edit' } });
  expect(save.disabled).toBe(true);
  await fireEvent.click(save);
  expect(puts).toBe(1);
  releaseProfile();
  await waitFor(() => expect(save.disabled).toBe(false));
  expect(puts).toBe(1);
  expect(concept.value).toBe('Later edit');
  client.clear();
});
it('the profile sent is the one on screen at submit', async () => {
  let releaseRename!: () => void;
  let renameStarted!: () => void;
  const renameGate = new Promise<void>((resolve) => {
    releaseRename = resolve;
  });
  const renameRequested = new Promise<void>((resolve) => {
    renameStarted = resolve;
  });
  let submittedProfile: Record<string, unknown> | undefined;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Release', concept: 'Original' }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, async ({ request }) => {
      const body = await request.json();
      renameStarted();
      await renameGate;
      return HttpResponse.json({ id: 'p', ...(body as { name: string }) });
    }),
    http.put(`${BASE}/v1/studio/projects/p`, async ({ request }) => {
      submittedProfile = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Renamed', concept: 'Submit concept' }),
      );
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Renamed' } });
  const concept = screen.getByLabelText(/Concept/) as HTMLTextAreaElement;
  await fireEvent.input(concept, { target: { value: 'Submit concept' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await renameRequested;
  await fireEvent.input(concept, { target: { value: 'Later concept' } });
  releaseRename();
  await waitFor(() => expect(submittedProfile).toBeDefined());
  expect(submittedProfile?.concept).toBe('Submit concept');
  expect(concept.value).toBe('Later concept');
  client.clear();
});
it('Saved is not announced when the form changed during the request', async () => {
  let releaseProfile!: () => void;
  let profileStarted!: () => void;
  const profileGate = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  const profileRequested = new Promise<void>((resolve) => {
    profileStarted = resolve;
  });
  let profileCompleted = false;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Release', concept: 'Original' }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.put(`${BASE}/v1/studio/projects/p`, async ({ request }) => {
      await request.json();
      profileStarted();
      await profileGate;
      const response = makeProjectProfile({
        library_project_id: 'p',
        name: 'Release',
        concept: 'Submitted',
      });
      profileCompleted = true;
      return HttpResponse.json(response);
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const concept = screen.getByLabelText(/Concept/) as HTMLTextAreaElement;
  await fireEvent.input(concept, { target: { value: 'Submitted' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await profileRequested;
  await fireEvent.input(concept, { target: { value: 'Changed after submit' } });
  releaseProfile();
  await waitFor(() => expect(profileCompleted).toBe(true));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(concept.value).toBe('Changed after submit');
  client.clear();
});
it('disables removal while tracks exist', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Release', track_count: 1 }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([makeTrack({ library_project_id: 'p' })]),
    ),
  );
  const client = show();
  await screen.findByText('Remove all tracks before removing this project from Studio.');
  expect(
    (screen.getByRole('button', { name: 'Remove from Studio' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  client.clear();
});

it('Remove is disabled during a save and remove() ignores a forced call', async () => {
  const patchGate = requestGate();
  const requests: string[] = [];
  const profile = makeProjectProfile({ library_project_id: 'p', name: 'Renamed' });
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, async () => {
      requests.push('PATCH');
      patchGate.start();
      await patchGate.wait;
      return HttpResponse.json({ id: 'p', name: 'Renamed' });
    }),
    http.put(`${BASE}/v1/studio/projects/p`, () => {
      requests.push('PUT');
      return HttpResponse.json(profile);
    }),
    http.delete(`${BASE}/v1/studio/projects/p`, () => {
      requests.push('DELETE');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const outerRemove = screen.getByRole('button', { name: 'Remove from Studio' });
  await waitFor(() => expect((outerRemove as HTMLButtonElement).disabled).toBe(false));
  await fireEvent.click(outerRemove);
  const dialog = await screen.findByRole('dialog');
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Renamed' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await patchGate.started;

  expect((outerRemove as HTMLButtonElement).disabled).toBe(true);
  const sheetRemove = screen.getAllByRole('button', { name: 'Remove from Studio' }).at(-1)!;
  expect((sheetRemove as HTMLButtonElement).disabled).toBe(true);
  // Simulate a stale click arriving after the control was disabled; the handler guard must hold too.
  (sheetRemove as HTMLButtonElement).disabled = false;
  await fireEvent.click(sheetRemove);
  expect(requests).toEqual(['PATCH']);

  patchGate.release();
  await waitFor(() => expect(requests).toEqual(['PATCH', 'PUT']));
  expect(screen.getByRole('dialog')).toBe(dialog);
  client.clear();
});

it('Save stays disabled while a removal is in flight, even after dismissing the sheet', async () => {
  state.goto.mockClear();
  const deleteGate = requestGate();
  const requests: string[] = [];
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.delete(`${BASE}/v1/studio/projects/p`, async () => {
      requests.push('DELETE');
      deleteGate.start();
      await deleteGate.wait;
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch(`${BASE}/v1/library/projects/p`, () => {
      requests.push('PATCH');
      return HttpResponse.json({ id: 'p', name: 'Release' });
    }),
    http.put(`${BASE}/v1/studio/projects/p`, () => {
      requests.push('PUT');
      return HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' }));
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const outerRemove = screen.getByRole('button', { name: 'Remove from Studio' });
  await waitFor(() => expect((outerRemove as HTMLButtonElement).disabled).toBe(false));
  await fireEvent.click(outerRemove);
  await screen.findByRole('dialog');
  await fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Studio' }).at(-1)!);
  await deleteGate.started;

  await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await fireEvent.submit(save.closest('form')!);
  expect(requests).toEqual(['DELETE']);

  deleteGate.release();
  await waitFor(() => expect(state.goto).toHaveBeenCalledWith('/app/studio'));
  expect(requests).toEqual(['DELETE']);
  client.clear();
});

it('Remove is disabled while a track is being created in the column', async () => {
  const createGate = requestGate();
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.post(`${BASE}/v1/studio/projects/p/tracks`, async ({ request }) => {
      const body = (await request.json()) as { title: string };
      createGate.start();
      await createGate.wait;
      return HttpResponse.json(makeTrack({ library_project_id: 'p', title: body.title }), {
        status: 201,
      });
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const remove = screen.getByRole('button', { name: 'Remove from Studio' }) as HTMLButtonElement;
  await waitFor(() => expect(remove.disabled).toBe(false));

  const create = client
    .getMutationCache()
    .build(client, createTrackMutationOptions(client, 'p'))
    .execute({ title: 'New track' });
  await createGate.started;
  await waitFor(() => expect(remove.disabled).toBe(true));

  createGate.release();
  await create;
  client.clear();
});

it('a failed removal re-enables both actions', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.delete(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      ),
    ),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const outerRemove = screen.getByRole('button', { name: 'Remove from Studio' });
  await waitFor(() => expect((outerRemove as HTMLButtonElement).disabled).toBe(false));
  await fireEvent.click(outerRemove);
  await screen.findByRole('dialog');
  await fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Studio' }).at(-1)!);
  await screen.findAllByRole('alert');

  await waitFor(() => {
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect((outerRemove as HTMLButtonElement).disabled).toBe(false);
  });
  expect(
    (screen.getAllByRole('button', { name: 'Remove from Studio' }).at(-1) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  client.clear();
});

it('reports partial save failures and preserves the form values', async () => {
  const profile = makeProjectProfile({
    library_project_id: 'p',
    name: 'Release',
    concept: 'Original',
  });
  let patches = 0;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () => HttpResponse.json(profile)),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, () => {
      patches++;
      return HttpResponse.json({ ...profile, name: 'Renamed', id: 'p' });
    }),
    http.put(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      ),
    ),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Renamed' } });
  await fireEvent.input(screen.getByLabelText(/Concept/), { target: { value: 'My concept' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText(/The Studio profile was not saved/)).toBeTruthy();
  expect(patches).toBe(1);
  expect((screen.getByLabelText(/Project name/) as HTMLInputElement).value).toBe('Renamed');
  expect((screen.getByLabelText(/Concept/) as HTMLTextAreaElement).value).toBe('My concept');
  client.clear();
});
it('places name conflicts and concept issues on their controls', async () => {
  const profile = makeProjectProfile({ library_project_id: 'p', name: 'Release' });
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () => HttpResponse.json(profile)),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, () =>
      HttpResponse.json(
        { error: 'project_name_conflict', message: 'conflict', status_code: 409 },
        { status: 409 },
      ),
    ),
    http.put(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        {
          error: 'document_invalid',
          message: 'invalid',
          status_code: 422,
          detail: { issues: [{ path: 'concept', code: 'too_long_after_normalization' }] },
        },
        { status: 422 },
      ),
    ),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Taken' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const conflict = await screen.findByText('A project with this name already exists.');
  const concept = await screen.findByText('This value is longer than allowed.');
  expect(screen.getByLabelText(/Project name/).getAttribute('aria-describedby')).toContain(
    conflict.id,
  );
  expect(screen.getByLabelText(/Concept/).getAttribute('aria-describedby')).toContain(concept.id);
  client.clear();
});
it('explains local length limits before submitting', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.input(screen.getByLabelText(/Concept/), { target: { value: 'x'.repeat(8001) } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  const issue = await screen.findByText('This value is longer than allowed.');
  expect(screen.getByLabelText(/Concept/).getAttribute('aria-describedby')).toContain(issue.id);
  client.clear();
});
it('removal asks in a sheet and Cancel keeps the project', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  const remove = screen.getByRole('button', { name: 'Remove from Studio' }) as HTMLButtonElement;
  await waitFor(() => expect(remove.disabled).toBe(false));
  await fireEvent.click(remove);
  expect(
    await screen.findByText('Remove this project from Studio? The Library project will be kept.'),
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByDisplayValue('Release')).toBeTruthy();
  expect(state.goto).not.toHaveBeenCalled();
  client.clear();
});

it('removes an empty project and returns to Studio after confirmation', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.delete(`${BASE}/v1/studio/projects/p`, () => new HttpResponse(null, { status: 204 })),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.click(screen.getByRole('button', { name: 'Remove from Studio' }));
  await screen.findByText('Remove this project from Studio? The Library project will be kept.');
  await fireEvent.click(screen.getAllByRole('button', { name: 'Remove from Studio' }).at(-1)!);
  await waitFor(() => expect(state.goto).toHaveBeenCalledWith('/app/studio'));
  client.clear();
});
