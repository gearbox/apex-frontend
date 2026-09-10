import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import RemoveDeploymentModal from './RemoveDeploymentModal.svelte';

afterEach(() => cleanup());

/** Stubs a fixed content rect so backdrop-vs-content geometry is deterministic in jsdom. */
function stubDialogRect(dialog: HTMLDialogElement): void {
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 300,
    top: 100,
    bottom: 300,
    width: 200,
    height: 200,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
}

function clickAt(target: EventTarget, x: number, y: number): void {
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
  );
}

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

  it('stays open for a click on dialog content, even when target equals currentTarget', () => {
    const onClose = vi.fn();
    render(RemoveDeploymentModal, {
      props: { modelName: 'Aisha', finalLive: false, onConfirm: vi.fn(), onClose },
    });
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    stubDialogRect(dialog);

    // Click inside the rendered rect, dispatched directly on the dialog (as a click on its own
    // padding/gaps would be) — target === currentTarget === dialog, but not a backdrop click.
    clickAt(dialog, 200, 200);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a real backdrop click while idle', () => {
    const onClose = vi.fn();
    render(RemoveDeploymentModal, {
      props: { modelName: 'Aisha', finalLive: false, onConfirm: vi.fn(), onClose },
    });
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    stubDialogRect(dialog);

    clickAt(dialog, 10, 10);

    expect(onClose).toHaveBeenCalledOnce();
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
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    stubDialogRect(dialog);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    clickAt(dialog, 10, 10);

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('dialog')).toBe(dialog);
  });
});
