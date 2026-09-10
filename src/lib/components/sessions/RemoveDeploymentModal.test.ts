import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import RemoveDeploymentModal from './RemoveDeploymentModal.svelte';

afterEach(() => cleanup());

describe('RemoveDeploymentModal', () => {
  it('focuses inside the native dialog, closes with Escape when idle, and restores focus', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const rendered = render(RemoveDeploymentModal, {
      props: {
        modelName: 'Aisha',
        finalLive: false,
        onConfirm: vi.fn(),
        onClose,
      },
    });

    const dialog = screen.getByRole('dialog');
    await tick();
    expect(dialog.contains(document.activeElement)).toBe(true);

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();

    rendered.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('does not dismiss a pending destructive action via Escape or the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(RemoveDeploymentModal, {
      props: {
        modelName: 'Aisha',
        finalLive: true,
        pending: true,
        onConfirm: vi.fn(),
        onClose,
      },
    });
    const dialog = screen.getByRole('dialog');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')).toBe(dialog);
  });
});
