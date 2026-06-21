import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { ApiRequestError } from '$lib/api/errors';

let mutateAsyncFn = vi.fn();
let isPendingMock = false;

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  createMutation: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      mutateAsync: mutateAsyncFn,
      get isPending() {
        return isPendingMock;
      },
    };
  }),
}));

vi.mock('$lib/stores/toasts', () => ({
  addToast: vi.fn(),
}));

import AdminBroadcastTab from './AdminBroadcastTab.svelte';
import { addToast } from '$lib/stores/toasts';

beforeEach(() => {
  isPendingMock = false;
  mutateAsyncFn = vi.fn().mockResolvedValue({ message: 'Broadcast queued' });
  vi.mocked(addToast).mockClear();
});

describe('AdminBroadcastTab', () => {
  it('renders all form fields', () => {
    render(AdminBroadcastTab);
    expect(screen.getByLabelText('Level')).toBeTruthy();
    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(screen.getByLabelText('Message')).toBeTruthy();
    expect(screen.getByLabelText(/expires at/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /send broadcast/i })).toBeTruthy();
  });

  it('disables Send button when title and message are empty', () => {
    render(AdminBroadcastTab);
    const btn = screen.getByRole('button', { name: /send broadcast/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables Send button when only title is filled', async () => {
    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Hello' } });
    const btn = screen.getByRole('button', { name: /send broadcast/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables Send button when title and message are filled', async () => {
    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Hello' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'World' } });
    const btn = screen.getByRole('button', { name: /send broadcast/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('calls mutation with trimmed body and null expiry when no expiry set', async () => {
    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: '  Alert  ' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: '  Details  ' } });

    await fireEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    await waitFor(() => {
      expect(mutateAsyncFn).toHaveBeenCalledWith({
        level: 'info',
        title: 'Alert',
        message: 'Details',
        expires_at: null,
      });
    });
  });

  it('converts datetime-local to ISO string for expires_at', async () => {
    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'T' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'M' } });
    await fireEvent.input(screen.getByLabelText(/expires at/i), {
      target: { value: '2026-12-31T23:59' },
    });

    await fireEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    await waitFor(() => {
      const call = mutateAsyncFn.mock.calls[0][0] as { expires_at: string };
      expect(call.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('resets form fields after successful send', async () => {
    render(AdminBroadcastTab);
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    const msgInput = screen.getByLabelText('Message') as HTMLTextAreaElement;

    await fireEvent.input(titleInput, { target: { value: 'Test' } });
    await fireEvent.input(msgInput, { target: { value: 'Body' } });
    await fireEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    await waitFor(() => {
      expect(titleInput.value).toBe('');
      expect(msgInput.value).toBe('');
    });
  });

  it('shows success toast after successful send', async () => {
    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'T' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'M' } });
    await fireEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith({ type: 'success', message: 'Broadcast sent' });
    });
  });

  it('renders ApiRequestError message inline', async () => {
    mutateAsyncFn = vi.fn().mockRejectedValue(
      new ApiRequestError({
        error: 'Forbidden',
        message: 'Admin role required',
        status_code: 403,
      }),
    );

    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'T' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'M' } });
    await fireEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    await waitFor(() => {
      expect(screen.queryByText('Admin role required')).not.toBeNull();
    });
  });

  it('renders generic error message for unknown errors', async () => {
    mutateAsyncFn = vi.fn().mockRejectedValue(new Error('Network error'));

    render(AdminBroadcastTab);
    await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'T' } });
    await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'M' } });
    await fireEvent.click(screen.getByRole('button', { name: /send broadcast/i }));

    await waitFor(() => {
      expect(screen.queryByText('Unexpected error. Please try again.')).not.toBeNull();
    });
  });

  it('disables Send button when mutation is pending', () => {
    isPendingMock = true;
    render(AdminBroadcastTab);
    const btn = screen.getByRole('button', { name: /sending/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
