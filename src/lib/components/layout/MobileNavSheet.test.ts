import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import MobileNavSheet from './MobileNavSheet.svelte';

function dispatchPointer(
  target: HTMLElement,
  type: string,
  {
    clientX = 0,
    clientY = 0,
    pointerId = 1,
  }: { clientX?: number; clientY?: number; pointerId?: number } = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  });
  target.dispatchEvent(event);
}

function renderSheet(onclose = vi.fn()) {
  const result = render(MobileNavSheet, {
    props: {
      id: 'test-sheet',
      label: 'Test sheet',
      onclose,
      children: createRawSnippet(() => ({ render: () => '<p>Sheet contents</p>' })),
    },
  });
  const dialog = screen.getByRole('dialog', { name: 'Test sheet' });
  Object.defineProperty(dialog, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ height: 400 }),
  });
  const shell = dialog.parentElement as HTMLElement;
  const dragZone = screen.getByTestId('mobile-nav-sheet-drag-zone');

  return { ...result, dragZone, onclose, shell };
}

describe('MobileNavSheet', () => {
  afterEach(() => cleanup());

  it('removes its transform after short drags and pointer cancellation, then dismisses once', async () => {
    const { dragZone, onclose, shell } = renderSheet();

    expect(shell.style.transform).toBe('');

    dispatchPointer(dragZone, 'pointerdown', { clientX: 20, clientY: 20 });
    dispatchPointer(dragZone, 'pointermove', { clientX: 20, clientY: 40 });
    await tick();
    expect(shell.style.transform).toBe('translateY(20px)');

    dispatchPointer(dragZone, 'pointerup', { clientX: 20, clientY: 40 });
    await tick();
    expect(shell.style.transform).toBe('translateY(0px)');
    await fireEvent.transitionEnd(shell, { propertyName: 'transform' });
    await tick();
    expect(shell.style.transform).toBe('');
    expect(onclose).not.toHaveBeenCalled();

    dispatchPointer(dragZone, 'pointerdown', { clientX: 20, clientY: 20 });
    dispatchPointer(dragZone, 'pointermove', { clientX: 20, clientY: 70 });
    await tick();
    dispatchPointer(dragZone, 'pointercancel', { clientX: 20, clientY: 70 });
    await tick();
    expect(shell.style.transform).toBe('translateY(0px)');
    await fireEvent.transitionEnd(shell, { propertyName: 'transform' });
    await tick();
    expect(shell.style.transform).toBe('');

    dispatchPointer(dragZone, 'pointerdown', { clientX: 20, clientY: 20 });
    dispatchPointer(dragZone, 'pointermove', { clientX: 20, clientY: 140 });
    await tick();
    dispatchPointer(dragZone, 'pointerup', { clientX: 20, clientY: 140 });
    await tick();
    expect(shell.style.transform).toBe('translateY(424px)');

    await fireEvent.transitionEnd(shell, { propertyName: 'transform' });
    await fireEvent.transitionEnd(shell, { propertyName: 'transform' });
    expect(onclose).toHaveBeenCalledOnce();
  });
});
