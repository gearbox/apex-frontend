import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MemoryForm from './MemoryForm.svelte';

describe('MemoryForm', () => {
  it('derives the title until edited, preserves body line breaks, and omits an undated create date', async () => {
    const onsubmit = vi.fn();
    render(MemoryForm, { props: { mode: 'create', idPrefix: 'create-test', onsubmit } });

    const body = screen.getByLabelText('What happened?');
    expect(screen.getByRole('button', { name: 'Save memory' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.input(body, {
      target: { value: 'First evening in Belgrade\nRain on the windows' },
    });
    await fireEvent.click(screen.getByText('More'));
    const title = screen.getByLabelText('Title');
    expect((title as HTMLInputElement).value).toBe('First evening in Belgrade');

    await fireEvent.input(title, { target: { value: 'A changed title' } });
    await fireEvent.input(body, {
      target: { value: 'A different first line\nRain on the windows' },
    });
    expect((title as HTMLInputElement).value).toBe('A changed title');

    await fireEvent.click(screen.getByRole('button', { name: 'No date' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    expect(onsubmit).toHaveBeenCalledWith({
      title: 'A changed title',
      body: 'A different first line\nRain on the windows',
      themes: [],
      imagery: [],
      salience: 3,
    });
  });

  it('sends occurred_on null when an edit clears its date and disables save while pending', async () => {
    const onsubmit = vi.fn();
    const rendered = render(MemoryForm, {
      props: {
        mode: 'edit',
        idPrefix: 'edit-test',
        initial: {
          title: 'The first show',
          body: 'A small room.\nA warm light.',
          occurred_on: '2026-08-10',
          themes: [],
          imagery: [],
          salience: 3,
        },
        pending: true,
        onsubmit,
      },
    });
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
    await rendered.rerender({
      mode: 'edit',
      idPrefix: 'edit-test',
      initial: {
        title: 'The first show',
        body: 'A small room.\nA warm light.',
        occurred_on: '2026-08-10',
        themes: [],
        imagery: [],
        salience: 3,
      },
      pending: false,
      onsubmit,
    });
    expect(screen.getByRole('button', { name: 'Save memory' }).hasAttribute('disabled')).toBe(
      false,
    );
    await fireEvent.click(screen.getByRole('button', { name: 'No date' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));

    expect(onsubmit).toHaveBeenCalledWith({
      title: 'The first show',
      body: 'A small room.\nA warm light.',
      occurred_on: null,
      themes: [],
      imagery: [],
      salience: 3,
    });
  });
});
