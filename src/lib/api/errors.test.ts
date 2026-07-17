import { describe, it, expect } from 'vitest';
import { ApiRequestError, isApiError, parseApiError, throwApiError } from './errors';

describe('parseApiError()', () => {
  it('passes an envelope body through unchanged', () => {
    const body = {
      error: 'idempotency_conflict',
      message: 'Key in use',
      status_code: 409,
      detail: { foo: 'bar' },
    };
    expect(parseApiError(body, 409)).toEqual(body);
  });

  it('keeps the real response status authoritative over a body status', () => {
    expect(
      parseApiError(
        { error: 'idempotency_conflict', message: 'Key in use', status_code: 400 },
        409,
      ),
    ).toMatchObject({ error: 'idempotency_conflict', message: 'Key in use', status_code: 409 });
  });

  it('preserves Litestar detail and extra metadata', () => {
    expect(
      parseApiError(
        { status_code: 400, detail: 'Amount is invalid', extra: { field: 'amount' } },
        400,
      ),
    ).toMatchObject({
      error: 'http_error',
      message: 'Amount is invalid',
      status_code: 400,
      detail: 'Amount is invalid',
      extra: { field: 'amount' },
    });
  });

  it('maps the compact provider-disabled body into the envelope', () => {
    const body = { code: 'payment_provider_disabled', provider: 'stripe' };
    expect(parseApiError(body, 409)).toEqual({
      error: 'payment_provider_disabled',
      message: 'Payment provider stripe is currently disabled',
      status_code: 409,
      detail: { provider: 'stripe' },
      provider: 'stripe',
    });
  });

  it('maps a compact body without a provider field', () => {
    const body = { code: 'payment_provider_disabled' };
    expect(parseApiError(body, 409)).toEqual({
      error: 'payment_provider_disabled',
      message: 'Request failed (409)',
      status_code: 409,
      detail: null,
    });
  });

  it('falls back to a generic message for an unrecognized compact code', () => {
    const body = { code: 'something_else', provider: 'stripe' };
    expect(parseApiError(body, 409)).toEqual({
      error: 'something_else',
      message: 'Request failed (409)',
      status_code: 409,
      detail: { provider: 'stripe' },
      provider: 'stripe',
    });
  });

  it('falls back to unknown_error for unrecognized junk', () => {
    expect(parseApiError({ nonsense: true }, 500)).toEqual({
      error: 'unknown_error',
      message: 'Request failed (500)',
      status_code: 500,
    });
    expect(parseApiError(null, 500)).toEqual({
      error: 'unknown_error',
      message: 'Request failed (500)',
      status_code: 500,
    });
  });

  it('uses the endpoint fallback for unknown transport failures', () => {
    try {
      throwApiError(undefined, 'Unable to start checkout', 0);
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({
        error: 'unknown_error',
        status_code: 0,
        message: 'Unable to start checkout',
      });
    }
  });
});

describe('isApiError()', () => {
  it('recognizes a well-formed envelope', () => {
    expect(isApiError({ error: 'x', message: 'y', status_code: 400 })).toBe(true);
  });

  it('rejects the compact compatibility body', () => {
    expect(isApiError({ code: 'payment_provider_disabled', provider: 'stripe' })).toBe(false);
  });

  it('rejects malformed envelope property types', () => {
    expect(isApiError({ error: 'x', message: 42, status_code: '400' })).toBe(false);
  });
});
