import {
  cleanupRecoveryUrlTest,
  expectRecoveryTokenSanitized,
  getRecoveryHarness,
  setupRecoveryUrlTest,
} from '../recovery-url-test-support';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { render } from '@testing-library/svelte';
import { clearAuth } from '$lib/stores/auth';

import Page from './+page.svelte';

const harness = getRecoveryHarness();
const verificationToken = 'd43a8f19c6e2057b1d9a4f3c8b6e0172a5d9c4f1e8b3076a2c5d9f4e1b8a6037';

beforeEach(() => {
  setupRecoveryUrlTest(
    `http://localhost/verify-email?token=${verificationToken}&campaign=spring&source=mail`,
  );
  clearAuth();
  harness.verifyEmail.mockImplementation((token: string) => {
    harness.events.push(`request:${token}`);
    return new Promise<void>(() => {});
  });
});

afterEach(() => {
  cleanupRecoveryUrlTest();
  clearAuth();
});

describe('verify email page URL cleanup', () => {
  it('replaces the URL before verification request processing and preserves other parameters', () => {
    render(Page);

    expectRecoveryTokenSanitized(verificationToken, { campaign: 'spring', source: 'mail' });
  });
});
