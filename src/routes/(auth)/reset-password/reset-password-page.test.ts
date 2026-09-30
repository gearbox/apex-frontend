import {
  cleanupRecoveryUrlTest,
  expectRecoveryTokenSanitized,
  getRecoveryHarness,
  setupRecoveryUrlTest,
} from '../recovery-url-test-support';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

const harness = getRecoveryHarness();
const resetToken = '1f6c9b074e2d8a31c0f5b7e9d246a8c15f3e0b7d9a42c6e18f05b3d7a9c24e61';

beforeEach(() => {
  setupRecoveryUrlTest(
    `http://localhost/reset-password?token=${resetToken}&source=mail&redirect=%2Fapp%2Flibrary`,
  );
});

afterEach(() => {
  cleanupRecoveryUrlTest();
});

describe('reset password page URL cleanup', () => {
  it('replaces the URL before a reset request and keeps unrelated query parameters', async () => {
    let finishRequest!: () => void;
    harness.resetPassword.mockImplementation((token: string) => {
      harness.events.push(`request:${token}`);
      return new Promise<void>((resolve) => {
        finishRequest = resolve;
      });
    });

    render(Page);
    await fireEvent.input(screen.getByLabelText('New Password'), {
      target: { value: 'safe-password-123' },
    });
    await fireEvent.input(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'safe-password-123' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expectRecoveryTokenSanitized(resetToken, { source: 'mail', redirect: '/app/library' });

    finishRequest();
  });
});
