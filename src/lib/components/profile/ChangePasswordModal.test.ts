import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import ChangePasswordModal from './ChangePasswordModal.svelte';
import QueryHost, { hostProps } from '$lib/components/legal/testing/QueryHost.svelte';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ChangePasswordModal', () => {
  it('R1-m: renders the password-not-set guidance for a 409 response', async () => {
    server.use(
      http.post(`${BASE}/v1/users/me/password`, () =>
        HttpResponse.json(
          {
            error: 'password_not_set',
            message: 'Server wording must not replace the localized guidance.',
            status_code: 409,
          },
          { status: 409 },
        ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(QueryHost, {
      props: hostProps(queryClient, ChangePasswordModal, { onclose: vi.fn() }),
    });

    await fireEvent.input(screen.getByLabelText('Current Password'), {
      target: { value: 'current-password' },
    });
    await fireEvent.input(screen.getByLabelText('New Password'), {
      target: { value: 'new-password' },
    });
    await fireEvent.input(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'new-password' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    await waitFor(() => expect(screen.getByText(/does not have a password yet/i)).toBeTruthy());
  });
});
