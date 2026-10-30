import type { ComponentProps } from 'svelte';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { get } from 'svelte/store';
import { server } from '../../../mocks/server';
import { makeWanModelInfo } from '../../../mocks/fixtures/wan';
import { makeLibraryAssetItem } from '../../../mocks/factories/library';
import { makeMediaObject } from '../../../mocks/factories/media';
import { generationStore } from '$lib/stores/generation';
import { clearToasts, toasts } from '$lib/stores/toasts';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import MediaPickerModal from './MediaPickerModal.svelte';
import SourceMediaInput from './SourceMediaInput.svelte';
import PromptInput from './PromptInput.svelte';
const base = 'http://localhost:8000';
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
  generationStore.reset();
  clearToasts();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
it('disables an incompatible WebM picker item with its reason', async () => {
  const item = makeLibraryAssetItem({
    source: 'upload',
    asset_ref: 'upload:webm',
    original_filename: 'source.webm',
    media: makeMediaObject({
      media_type: 'video',
      original: { url: '', content_type: 'video/webm', size_bytes: 1, duration_ms: 5000 },
    }),
  });
  server.use(
    http.get(`${base}/v1/library`, () =>
      HttpResponse.json({ items: [item], has_more: false, next_cursor: null, limit: 20 }),
    ),
  );
  render(QueryHarness<ComponentProps<typeof MediaPickerModal>>, {
    client,
    component: MediaPickerModal,
    componentProps: {
      open: true,
      mediaTypes: ['video'],
      modelInfo: makeWanModelInfo(),
      mode: 'v2v',
      onclose: vi.fn(),
      onselect: vi.fn(),
    },
  });
  const button = await screen.findByRole('button', { name: /source.webm/ });
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/Use MOV, MP4/)).toBeTruthy();
});
it('rejects WebM before making any upload request', async () => {
  let uploads = 0;
  server.use(
    http.post(`${base}/v1/storage/upload`, () => {
      uploads++;
      return HttpResponse.json({});
    }),
  );
  const { container } = render(QueryHarness<ComponentProps<typeof SourceMediaInput>>, {
    client,
    component: SourceMediaInput,
    componentProps: { modelInfo: makeWanModelInfo(), effectiveMode: 'v2v' },
  });
  await fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['x'], 'clip.webm', { type: 'video/webm' })] },
  });
  expect(uploads).toBe(0);
  expect(get(toasts).at(-1)?.message).toBe('Use MOV, MP4.');
  expect(get(generationStore).sourceMedia).toHaveLength(0);
});
it('labels R2V sources in order and renumbers exact tokens on removal', async () => {
  generationStore.setPrompt('Image 2 waves');
  generationStore.setSourceMedia(
    ['a', 'b', 'c'].map((id) => ({
      assetRef: `upload:${id}`,
      mediaType: 'image',
      role: null,
      available: true,
      media: null,
      label: null,
      previewUrl: null,
    })),
  );
  const insert = vi.fn();
  render(QueryHarness<ComponentProps<typeof SourceMediaInput>>, {
    client,
    component: SourceMediaInput,
    componentProps: { modelInfo: makeWanModelInfo(), effectiveMode: 'r2v', oninserttoken: insert },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Image 2' }));
  expect(insert).toHaveBeenCalledWith('Image 2');
  await fireEvent.click(screen.getAllByRole('button', { name: 'Remove source media' })[0]);
  await waitFor(() => expect(get(generationStore).prompt).toBe('Image 1 waves'));
  expect(screen.queryByRole('button', { name: 'Image 3' })).toBeNull();
});
it('inserts through the public prompt handle at the saved cursor', async () => {
  generationStore.setPrompt('hello world');
  const rendered = render(PromptInput, { maxLength: 50 });
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  textarea.setSelectionRange(6, 6);
  await fireEvent.select(textarea);
  await rendered.component.insertAtCursor('Image 2');
  expect(get(generationStore).prompt).toBe('hello Image 2 world');
  expect(textarea.selectionStart).toBe(14);
});
