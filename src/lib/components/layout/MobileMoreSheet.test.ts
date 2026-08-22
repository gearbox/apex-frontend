import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { closeMobileNavSheet, openMoreSheet } from '$lib/stores/ui';
import MobileMoreSheet from './MobileMoreSheet.svelte';

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

describe('MobileMoreSheet', () => {
  afterEach(() => {
    closeMobileNavSheet();
    cleanup();
  });

  it('uses the shared dialog shell and closes on Escape', async () => {
    openMoreSheet();
    render(MobileMoreSheet);
    await tick();

    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    await fireEvent.keyDown(window, { key: 'Escape' });
    await tick();

    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('does not duplicate Sessions inside More', async () => {
    openMoreSheet();
    render(MobileMoreSheet);
    await tick();

    expect(screen.queryByRole('link', { name: 'Sessions' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Billing & Tokens' }).getAttribute('href')).toBe(
      '/app/billing',
    );
    expect(screen.getByRole('link', { name: 'Job History' }).getAttribute('href')).toBe(
      '/app/jobs',
    );
    expect(screen.getByRole('link', { name: 'Profile & Settings' }).getAttribute('href')).toBe(
      '/app/profile',
    );
  });

  it('closes when its backdrop is clicked', async () => {
    openMoreSheet();
    const { container } = render(MobileMoreSheet);
    await tick();

    await fireEvent.click(container.querySelector('[role="presentation"]')!);
    await tick();

    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });

  it('dismisses only a sufficiently long drag that starts on the shared handle', async () => {
    openMoreSheet();
    render(MobileMoreSheet);
    await tick();

    const dialog = screen.getByRole('dialog', { name: 'More' });
    Object.defineProperty(dialog, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 400 }),
    });
    const dragZone = screen.getByTestId('mobile-nav-sheet-drag-zone');

    dispatchPointer(dragZone, 'pointerdown', { clientX: 20, clientY: 20 });
    dispatchPointer(dragZone, 'pointermove', { clientX: 20, clientY: 40 });
    dispatchPointer(dragZone, 'pointerup', { clientX: 20, clientY: 40 });
    await tick();
    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy();

    dispatchPointer(dragZone, 'pointerdown', { clientX: 20, clientY: 20 });
    dispatchPointer(dragZone, 'pointermove', { clientX: 20, clientY: 140 });
    dispatchPointer(dragZone, 'pointerup', { clientX: 20, clientY: 140 });
    await tick();

    const shell = dialog.parentElement!;
    await fireEvent.transitionEnd(shell, { propertyName: 'transform' });
    await tick();
    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });

  it('snaps back after pointer cancellation without closing', async () => {
    openMoreSheet();
    render(MobileMoreSheet);
    await tick();

    const dragZone = screen.getByTestId('mobile-nav-sheet-drag-zone');
    dispatchPointer(dragZone, 'pointerdown', { clientX: 20, clientY: 20 });
    dispatchPointer(dragZone, 'pointermove', { clientX: 20, clientY: 100 });
    dispatchPointer(dragZone, 'pointercancel', { clientX: 20, clientY: 100 });
    await tick();

    expect(screen.getByRole('dialog', { name: 'More' })).toBeTruthy();
    const shell = screen.getByRole('dialog', { name: 'More' }).parentElement!;
    expect(shell.getAttribute('style')).toContain('translateY(0px)');

    await fireEvent.transitionEnd(shell, { propertyName: 'transform' });
    await tick();
    expect(shell.getAttribute('style')).toBe('');
  });
});
