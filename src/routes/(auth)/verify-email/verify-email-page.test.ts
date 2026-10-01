import {
  cleanupRecoveryUrlTest,
  expectRecoveryTokenSanitized,
  getRecoveryHarness,
  navigateRecoveryUrl,
  setupRecoveryUrlTest,
} from '../recovery-url-test-support';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { clearAuth, setUser } from '$lib/stores/auth';

import { fetchCurrentUserProfile } from '$lib/api/user';
import { makeUserProfile } from '../../../mocks/factories/user';
import Page from './+page.svelte';

vi.mock('$lib/api/user', () => ({ fetchCurrentUserProfile: vi.fn() }));

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
  it('ignores verification completion after the owning component unmounts', async () => {
    let finishVerification!: () => void;
    const verification = new Promise<void>((resolve) => {
      finishVerification = resolve;
    });
    harness.verifyEmail.mockReturnValue(verification);
    setUser(makeUserProfile());
    const { unmount } = render(Page);

    expect(harness.verifyEmail).toHaveBeenCalledTimes(1);
    unmount();
    finishVerification();
    await verification;

    expect(fetchCurrentUserProfile).not.toHaveBeenCalled();
  });

  it('verifies once per mount after shallow URL cleanup and preserves other parameters', async () => {
    render(Page);

    await waitFor(() => expect(harness.verifyEmail).toHaveBeenCalledTimes(1));
    expect(harness.verifyEmail).toHaveBeenCalledWith(verificationToken);
    expectRecoveryTokenSanitized(verificationToken, { campaign: 'spring', source: 'mail' });
    navigateRecoveryUrl('http://localhost/verify-email?token=another-token');
    await waitFor(() => expect(harness.verifyEmail).toHaveBeenCalledTimes(1));
    expect(harness.replaceState).toHaveBeenCalledTimes(1);
  });
});
