import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TagListInput from './TagListInput.svelte';

describe('TagListInput', () => {
  it('adds, removes, and rejects case-insensitive duplicate tags with keyboard input', async () => {
    render(TagListInput, {
      props: { id: 'styles', label: 'Style tags', values: [], maxItems: 3, maxLength: 20 },
    });
    const input = screen.getByLabelText('Style tags');

    await fireEvent.input(input, { target: { value: 'Dream pop' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Dream pop')).toBeTruthy();

    await fireEvent.input(input, { target: { value: 'dream POP' } });
    await fireEvent.keyDown(input, { key: ',' });
    expect(screen.getByRole('status').textContent).toBe('That tag is already here.');
    expect(screen.getAllByText(/Dream pop/i)).toHaveLength(1);

    await fireEvent.click(screen.getByRole('button', { name: 'Remove Dream pop' }));
    expect(screen.queryByText('Dream pop')).toBeNull();
  });

  it('rejects brackets and enforces item-count and code-point length limits', async () => {
    render(TagListInput, {
      props: { id: 'short-tags', label: 'Short tags', values: [], maxItems: 1, maxLength: 3 },
    });
    const input = screen.getByLabelText('Short tags');

    await fireEvent.input(input, { target: { value: 'bad[tag' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toContain('Square brackets');

    await fireEvent.input(input, { target: { value: 'long' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toContain('up to 3 characters');

    await fireEvent.input(input, { target: { value: 'one' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('one')).toBeTruthy();
    await fireEvent.input(input, { target: { value: 'two' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('status').textContent).toContain('up to 1 tags');

    await fireEvent.click(screen.getByRole('button', { name: 'Remove one' }));
    expect(screen.queryByText('one')).toBeNull();
  });
});
