import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { closeMobileNavSheet, openMoreSheet } from '$lib/stores/ui';
import MobileMoreSheet from './MobileMoreSheet.svelte';

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

  it('closes when its backdrop is clicked', async () => {
    openMoreSheet();
    const { container } = render(MobileMoreSheet);
    await tick();

    await fireEvent.click(container.querySelector('[role="presentation"]')!);
    await tick();

    expect(screen.queryByRole('dialog', { name: 'More' })).toBeNull();
  });
});
