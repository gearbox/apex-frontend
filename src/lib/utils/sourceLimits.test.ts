import { describe, expect, it } from 'vitest';
import { makeWanModelInfo } from '../../mocks/fixtures/wan';
import type { SourceMediaDraft } from '$lib/stores/generation';
import {
  formatForContentType,
  formatDecimalBytes,
  fileLimitViolation,
  sourceMediaLimitViolation,
} from './sourceLimits';
const model = makeWanModelInfo();
function source(
  media: Partial<NonNullable<SourceMediaDraft['media']>> = {},
  mediaType = 'video',
): SourceMediaDraft {
  return {
    assetRef: 'upload:x',
    mediaType,
    role: null,
    available: true,
    label: null,
    previewUrl: null,
    media: {
      url: '',
      content_type: 'video/mp4',
      size_bytes: 100000000,
      duration_ms: 1000,
      ...media,
    },
  };
}
function violation(draft: SourceMediaDraft) {
  return sourceMediaLimitViolation(draft, model, 'v2v', [draft]);
}
describe('source discovery limits', () => {
  it.each([
    ['IMAGE/JPG', 'jpeg'],
    ['video/quicktime', 'mov'],
    ['image/png', 'png'],
    ['image/jpeg', 'jpeg'],
    ['image/webp', 'webp'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'],
    ['video/unknown', null],
  ])('maps %s', (ct, format) => expect(formatForContentType(ct)).toBe(format));
  it('uses decimal MB', () => expect(formatDecimalBytes(100000000)).toBe('100 MB'));
  it('defers unknown metadata to the backend', () =>
    expect(violation({ ...source(), media: null })).toBeNull());
  it('rejects WebM with allowed formats', () =>
    expect(violation(source({ content_type: 'video/webm' }))).toMatch(/MOV.*MP4/));
  it.each([999, 1000, 1001, 14999, 15000, 15001])(
    'checks duration %s at boundaries',
    (duration_ms) =>
      expect(violation(source({ duration_ms })) === null).toBe(
        duration_ms >= 1000 && duration_ms <= 15000,
      ),
  );
  it.each([99999999, 100000000, 100000001])('checks video bytes %s', (size_bytes) =>
    expect(violation(source({ size_bytes })) === null).toBe(size_bytes <= 100000000),
  );
  it.each([19999999, 20000000, 20000001])('checks image bytes %s', (size_bytes) =>
    expect(violation(source({ content_type: 'image/png', size_bytes }, 'image')) === null).toBe(
      size_bytes <= 20000000,
    ),
  );
  it('checks combined rounded seconds with an advertised smaller cap', () => {
    const draft = source({ duration_ms: 15000 });
    expect(
      sourceMediaLimitViolation(
        draft,
        { ...model, video: { ...model.video!, max_combined_duration: 16 } },
        'v2v',
        [draft],
      ),
    ).toMatch(/too long/);
  });
  it('preflights file type and size without uploading', () => {
    expect(
      fileLimitViolation(new File(['x'], 'a.webm', { type: 'video/webm' }), model, 'video'),
    ).toMatch(/MOV.*MP4/);
    expect(
      fileLimitViolation(new File(['x'], 'a.mp4', { type: 'video/mp4' }), model, 'video'),
    ).toBeNull();
  });
});
