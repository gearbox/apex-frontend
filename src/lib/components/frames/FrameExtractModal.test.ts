import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { ASSET_REF, videoMedia, uploaded, installMediaMocks } from './frameTestFixtures';
import { FrameExtractionSession } from './frameExtractionSession';
import { feedbackDialog } from '$lib/stores/feedbackDialog.svelte';

const { upload, invalidate, goto, prefill } = vi.hoisted(() => ({
  upload: vi.fn(),
  invalidate: vi.fn(),
  goto: vi.fn(),
  prefill: vi.fn<(options: { source: { assetRef: string } }) => boolean>(() => true),
}));
vi.mock('$lib/api/upload', () => ({ uploadMedia: upload }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidate }),
  createQuery: () => ({ data: { providers: [] } }),
}));
vi.mock('$lib/services/generationPrefill', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/services/generationPrefill')>()),
  prefillSourceForGeneration: prefill,
}));
vi.mock('$lib/utils/breakpoints', () => ({ isDesktop: writable(false) }));
import FrameExtractModal from './FrameExtractModal.svelte';

beforeEach(() => {
  vi.clearAllMocks();
  installMediaMocks();
  upload.mockResolvedValue(uploaded);
  feedbackDialog.reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  feedbackDialog.reset();
});
function modal(media = videoMedia, trigger?: HTMLElement) {
  const onclose = vi.fn();
  const result = render(FrameExtractModal, {
    props: { assetRef: ASSET_REF, media, onclose, trigger },
  });
  return { ...result, onclose };
}
async function ready() {
  await screen.findByRole('heading', { name: 'Automatic' }, { timeout: 3000 });
}

describe('client frame modal', () => {
  it('renders six local automatic previews and no requests to the old API', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    modal();
    await ready();
    expect(screen.getAllByRole('button', { name: /^Automatic:/ })).toHaveLength(6);
    expect(fetch.mock.calls.some((call) => String(call[0]).includes('/v1/frames'))).toBe(false);
    expect(screen.getByText('Frames added from the scrubber will appear here.')).toBeTruthy();
  });
  it('traps focus, handles Escape and restores focus on destruction', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const f = modal(videoMedia, trigger);
    await ready();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(document.activeElement).toBe(close);
    await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).not.toBe(close);
    await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(f.onclose).toHaveBeenCalledOnce();
    f.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
  it('shows unavailable videos without decoding and reports with canonical asset and bug category', async () => {
    const media = structuredClone(videoMedia);
    media.original.duration_ms = null;
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const f = modal(media, trigger);
    await screen.findByText("Frame extraction isn't available for this video");
    expect(screen.getByRole('dialog').querySelector('video')?.hasAttribute('src')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Report this video' }));
    expect(f.onclose).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(feedbackDialog.context).toEqual({ assetRef: ASSET_REF, initialCategory: 'bug' }),
    );
    f.unmount();
    trigger.remove();
  });
  it('shows the unsupported state for a non-decodable video', async () => {
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(0);
    modal();
    await screen.findByText("This video can't be opened in this browser");
    expect(screen.getByRole('button', { name: 'Report this video' })).toBeTruthy();
  });
  it('adds and removes manual frames and gives duplicate feedback', async () => {
    modal();
    await ready();
    const slider = screen.getByRole('slider');
    await fireEvent.input(slider, { target: { value: '1250' } });
    const add = screen.getByRole('button', { name: 'Add frame' });
    await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(add);
    await screen.findByRole('button', { name: 'Manually chosen frames: 00:01.250' });
    await fireEvent.click(add);
    await screen.findByText('Frame already added');
    await fireEvent.click(
      screen.getByRole('button', { name: 'Remove manually chosen frame at 00:01.250' }),
    );
    expect(screen.queryByRole('button', { name: 'Manually chosen frames: 00:01.250' })).toBeNull();
  });
  it('uploads selection and uses the resulting upload as a generation source', async () => {
    modal();
    await ready();
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Use as input' }));
    expect(upload.mock.calls[0][1]).toMatchObject({
      lineage: { sourceAssetRef: ASSET_REF, timestampMs: 0 },
    });
    expect(prefill.mock.calls[0][0].source.assetRef).toBe(`upload:${uploaded.id}`);
    expect(goto).toHaveBeenCalledWith('/app/create');
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
  it('keeps completed uploads when retrying a scrub after a partial batch failure', async () => {
    upload
      .mockResolvedValueOnce(uploaded)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ...uploaded, id: 'c0000000-0000-4000-8000-000000000003' });
    modal();
    await ready();
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.000' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Automatic: 00:00.500' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await screen.findByRole('button', { name: 'Retry' });
    const scrub = vi
      .spyOn(FrameExtractionSession.prototype, 'scrub')
      .mockImplementation((_timestamp, onError) => onError(new Error('network')));
    await fireEvent.input(screen.getByRole('slider'), { target: { value: '1250' } });
    scrub.mockRestore();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Extract frames' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Use as input' })).toHaveLength(2),
    );
    expect(upload.mock.calls.map((call) => call[1].lineage.timestampMs)).toEqual([0, 500, 500]);
  });
});
