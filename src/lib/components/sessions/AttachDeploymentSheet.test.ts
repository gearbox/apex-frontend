import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import AttachDeploymentSheet from './AttachDeploymentSheet.svelte';

afterEach(() => cleanup());

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

const models = [
  { model: 'aisha-image-lite', name: 'Aisha Lite' },
  { model: 'grok-imagine-image', name: 'Grok' },
] as never;

describe('AttachDeploymentSheet', () => {
  it('renders every eligible model and calls onAttach with the chosen one', async () => {
    const onAttach = vi.fn();
    render(AttachDeploymentSheet, { props: { models, onAttach, onClose: vi.fn() } });

    expect(screen.getByText('Aisha Lite')).toBeTruthy();
    expect(screen.getByText('Grok')).toBeTruthy();

    screen.getByText('Grok').closest('button')?.click();
    expect(onAttach).toHaveBeenCalledWith('grok-imagine-image');
  });

  it('shows the empty state when there are no attachable models', () => {
    render(AttachDeploymentSheet, { props: { models: [], onAttach: vi.fn(), onClose: vi.fn() } });
    expect(screen.getByText('No compatible available models were found.')).toBeTruthy();
  });

  it('focuses inside the dialog and restores focus to the invoking control on close', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const rendered = render(AttachDeploymentSheet, {
      props: { models, onAttach: vi.fn(), onClose: vi.fn() },
    });
    const dialog = screen.getByRole('dialog');
    await tick();
    expect(dialog.contains(document.activeElement)).toBe(true);

    rendered.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('closes on a real backdrop click while idle but not on a click inside the sheet', () => {
    const onClose = vi.fn();
    render(AttachDeploymentSheet, { props: { models, onAttach: vi.fn(), onClose } });
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    stubDialogRect(dialog);

    clickAt(dialog, 200, 200);
    expect(onClose).not.toHaveBeenCalled();

    clickAt(dialog, 10, 10);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not dismiss a pending attach via Escape or the backdrop', () => {
    const onClose = vi.fn();
    render(AttachDeploymentSheet, {
      props: { models, pending: true, onAttach: vi.fn(), onClose },
    });
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    stubDialogRect(dialog);

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    clickAt(dialog, 10, 10);

    expect(onClose).not.toHaveBeenCalled();
  });
});
