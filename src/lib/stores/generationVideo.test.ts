import { beforeEach, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { generationStore, generationDraftFingerprint } from './generation';
beforeEach(() => generationStore.reset());
it('starts video controls at model defaults and tracks their draft changes', () => {
  const initial = get(generationStore);
  expect(initial).toMatchObject({
    videoAspectRatio: null,
    audio: null,
    promptExtend: null,
    videoSeed: null,
  });
  const baseline = generationDraftFingerprint(initial);
  generationStore.setVideoAspectRatio('16:9');
  generationStore.setAudio(false);
  generationStore.setPromptExtend(true);
  generationStore.setVideoSeed(0);
  expect(generationDraftFingerprint(get(generationStore))).not.toBe(baseline);
  generationStore.setMode('r2v');
  expect(get(generationStore).videoAspectRatio).toBeNull();
  expect(get(generationStore).audio).toBe(false);
  generationStore.setModel('wan3.0-video');
  expect(get(generationStore)).toMatchObject({
    videoAspectRatio: null,
    audio: null,
    promptExtend: null,
    videoSeed: null,
  });
});
it('allows discovery to own the duration and preserves explicit prefill settings', () => {
  generationStore.setVideoDuration(30);
  expect(get(generationStore).videoDuration).toBe(30);
  generationStore.prefill({
    videoAspectRatio: '16:9',
    audio: false,
    promptExtend: false,
    videoSeed: 10,
  });
  expect(get(generationStore)).toMatchObject({
    videoAspectRatio: '16:9',
    audio: false,
    promptExtend: false,
    videoSeed: 10,
  });
  generationStore.prefill({ prompt: 'new' });
  expect(get(generationStore)).toMatchObject({
    videoAspectRatio: null,
    audio: null,
    promptExtend: null,
    videoSeed: null,
  });
});
