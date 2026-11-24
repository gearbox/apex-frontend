import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ContextMenuTestHarness from './ContextMenuTestHarness.svelte';

afterEach(cleanup);

describe('ContextMenu', () => {
  it('children receive a trigger that toggles the menu and returns focus', async () => {
    const { getByRole } = render(ContextMenuTestHarness);
    const trigger = getByRole('button', { name: 'Open actions' });

    await fireEvent.click(trigger);
    const archive = await screen.findByRole('menuitem', { name: 'Archive' });
    await waitFor(() => expect(document.activeElement).toBe(archive));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(archive);
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByText('Action completed')).toBeTruthy();

    await fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeTruthy();
    await fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
