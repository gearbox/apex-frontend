import { describe, expect, it, vi } from 'vitest';
import { isDialogBackdropClick } from './dialogController.svelte';

function stubDialog(rect: Partial<DOMRect>): HTMLDialogElement {
  const dialog = document.createElement('dialog');
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
    ...rect,
  });
  return dialog;
}

function clickAt(x: number, y: number): MouseEvent {
  return new MouseEvent('click', { clientX: x, clientY: y });
}

describe('isDialogBackdropClick', () => {
  it('is false for a click inside the dialog content box', () => {
    const dialog = stubDialog({});
    expect(isDialogBackdropClick(dialog, clickAt(200, 200))).toBe(false);
  });

  it('is false for a click on the dialog element itself within its own padding/gaps', () => {
    const dialog = stubDialog({});
    // Still inside the rendered rect, even though target === currentTarget === dialog.
    expect(isDialogBackdropClick(dialog, clickAt(105, 105))).toBe(false);
  });

  it('is true for a click truly outside the dialog rectangle', () => {
    const dialog = stubDialog({});
    expect(isDialogBackdropClick(dialog, clickAt(50, 50))).toBe(true);
    expect(isDialogBackdropClick(dialog, clickAt(350, 350))).toBe(true);
  });

  it('never treats a keyboard-activated (0,0) click as a backdrop hit', () => {
    // A dialog rendered flush against the viewport origin would otherwise make every
    // keyboard-activated click look like a backdrop click.
    const dialog = stubDialog({ left: 0, right: 200, top: 0, bottom: 200 });
    expect(isDialogBackdropClick(dialog, clickAt(0, 0))).toBe(false);
  });
});
