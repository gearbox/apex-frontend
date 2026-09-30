import { describe, expect, it } from 'vitest';
import {
  codePointLength,
  FEEDBACK_ADMIN_NOTE_MAX_CODE_POINTS,
  FEEDBACK_MESSAGE_MAX_CODE_POINTS,
  FEEDBACK_STATUS_COLORS,
  feedbackCategoryLabel,
  feedbackAppVersion,
  feedbackStatusLabel,
  resolveFeedbackAssetUrl,
  validateFeedbackMessage,
} from './feedback';
import type { FeedbackCategory, FeedbackStatus } from '$lib/api/feedback';

describe('validateFeedbackMessage()', () => {
  it('trims before counting Unicode code points', () => {
    expect(validateFeedbackMessage('   1234567890   ')).toMatchObject({
      trimmed: '1234567890',
      codePointCount: 10,
      validity: 'valid',
    });
  });

  it('enforces the inclusive 10–4000 code-point bounds', () => {
    expect(validateFeedbackMessage('123456789').validity).toBe('too_short');
    expect(validateFeedbackMessage('1234567890').validity).toBe('valid');
    expect(validateFeedbackMessage('a'.repeat(FEEDBACK_MESSAGE_MAX_CODE_POINTS)).validity).toBe(
      'valid',
    );
    expect(validateFeedbackMessage('a'.repeat(FEEDBACK_MESSAGE_MAX_CODE_POINTS + 1)).validity).toBe(
      'too_long',
    );
  });

  it('counts an emoji as one code point and rejects NUL anywhere in the raw text', () => {
    expect(validateFeedbackMessage('😀'.repeat(10))).toMatchObject({
      codePointCount: 10,
      validity: 'valid',
    });
    expect(validateFeedbackMessage('1234567890\u0000')).toMatchObject({
      validity: 'contains_nul',
    });
  });
});

describe('feedback code-point helpers and labels', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(codePointLength('a😀')).toBe(2);
    expect(codePointLength('😀'.repeat(FEEDBACK_ADMIN_NOTE_MAX_CODE_POINTS))).toBe(4000);
  });

  it('has a display colour and non-empty localized label for every feedback status', () => {
    const statuses: FeedbackStatus[] = ['open', 'in_progress', 'resolved', 'dismissed'];
    for (const status of statuses) {
      expect(FEEDBACK_STATUS_COLORS[status]).toBeTruthy();
      expect(feedbackStatusLabel(status)).toBeTruthy();
    }
  });

  it('has a non-empty localized label for every feedback category', () => {
    const categories: FeedbackCategory[] = [
      'bug',
      'generation',
      'billing',
      'account',
      'content',
      'other',
    ];
    for (const category of categories) expect(feedbackCategoryLabel(category)).toBeTruthy();
  });
});

describe('resolveFeedbackAssetUrl()', () => {
  const valid = '/v1/content/feedback/11111111-1111-4111-8111-111111111111';

  it('accepts only the exact feedback media path', () => {
    expect(resolveFeedbackAssetUrl(valid)).toBe(
      'http://localhost:8000/v1/content/feedback/11111111-1111-4111-8111-111111111111',
    );
  });

  it.each([
    '/v1/content/feedback/11111111-1111-4111-8111-111111111111?token=x',
    '/v1/content/feedback/11111111-1111-4111-8111-111111111111#part',
    'https://evil.example/v1/content/feedback/11111111-1111-4111-8111-111111111111',
    '//evil.example/v1/content/feedback/11111111-1111-4111-8111-111111111111',
    '/v1/content/outputs/11111111-1111-4111-8111-111111111111',
    '/v1/content/feedback/../outputs/11111111-1111-4111-8111-111111111111',
  ])('rejects unsafe or mismatched paths: %s', (value) => {
    expect(resolveFeedbackAssetUrl(value)).toBeNull();
  });
});

it('builds a compact version and build identifier', () => {
  expect(feedbackAppVersion()).toContain('+');
  expect(feedbackAppVersion().length).toBeLessThanOrEqual(64);
});
