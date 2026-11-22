import { describe, expect, it } from 'vitest';
import { issueField, issueMessage, memorySaveError } from './formErrors';
import { ApiRequestError } from '$lib/api/errors';

describe('studio validation issues', () => {
  it.each([
    ['empty_after_normalization', 'Enter a value.'],
    ['too_long_after_normalization', 'This value is longer than allowed.'],
    ['duplicate_tag', 'This tag is already listed.'],
    ['reserved_characters', 'Square brackets are not allowed.'],
    ['reserved_tempo_tag', 'Tempo tags are not allowed here.'],
    ['document_too_large', 'The document is too large.'],
  ])('maps %s to a localized message', (code, expected) => {
    expect(issueMessage({ path: 'name', code })).toBe(expected);
  });

  it('uses a generic message for unknown codes and extracts the field before an array index', () => {
    expect(issueMessage({ path: 'name', code: 'future_validation_code' })).toBe(
      "This value isn't valid.",
    );
    expect(issueField({ path: 'themes[2]', code: 'too_long_after_normalization' })).toBe('themes');
  });
});

describe('memorySaveError', () => {
  it('maps limit, validation, server and network failures', () => {
    expect(
      memorySaveError(
        new ApiRequestError({
          error: 'memory_limit_reached',
          message: 'At limit',
          status_code: 409,
        }),
      ),
    ).toBe('This artist has 200 active memories. Archive one before adding another.');
    expect(
      memorySaveError(
        new ApiRequestError({
          error: 'document_invalid',
          message: 'Invalid document',
          status_code: 422,
        }),
      ),
    ).toBe('');
    expect(
      memorySaveError(
        new ApiRequestError({ error: 'server_error', message: 'Failed', status_code: 500 }),
      ),
    ).toBe('We could not save this memory. Please try again.');
    expect(memorySaveError(new TypeError('Network unavailable'))).toBe(
      'We could not save this memory. Please try again.',
    );
  });
});
