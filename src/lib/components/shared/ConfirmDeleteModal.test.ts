import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ConfirmDeleteModal from './ConfirmDeleteModal.svelte';

describe('ConfirmDeleteModal', () => {
  it('keeps the custom delete label while pending and disables the actions', async () => {
    const rendered = render(ConfirmDeleteModal, {
      props: {
        title: 'Delete asset',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        onconfirm: vi.fn(),
        oncancel: vi.fn(),
      },
    });

    const deleteButton = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(false);
    expect(deleteButton.textContent?.trim()).toBe('Delete');

    await rendered.rerender({ isPending: true });

    expect(deleteButton.disabled).toBe(true);
    expect(deleteButton.textContent?.trim()).toBe('Delete');
    expect(deleteButton.textContent).not.toContain('…');
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
