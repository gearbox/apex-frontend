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

  it('renders one hint, describes the hint and status text, and accepts 60 emoji code points', async () => {
    render(TagListInput, {
      props: {
        id: 'style-tags',
        label: 'Style tags',
        values: [],
        maxItems: 3,
        maxLength: 60,
        hint: 'Exported to Style.',
      },
    });
    const input = screen.getByLabelText('Style tags');
    expect(screen.getAllByText('Exported to Style.')).toHaveLength(1);
    expect(input.getAttribute('aria-describedby')).toBe(
      'style-tags-count style-tags-feedback style-tags-hint',
    );

    const sixtyEmoji = '🌊'.repeat(60);
    await fireEvent.input(input, { target: { value: sixtyEmoji } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText(sixtyEmoji)).toBeTruthy();
  });
  it('disabled blocks both adding and removing', async () => {
    render(TagListInput, {
      props: {
        id: 'locked',
        label: 'Tags',
        values: ['Existing'],
        maxItems: 3,
        maxLength: 20,
        disabled: true,
      },
    });
    const input = screen.getByRole('textbox', { name: 'Tags' }) as HTMLInputElement;
    const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    const remove = screen.getByRole('button', { name: 'Remove Existing' }) as HTMLButtonElement;
    expect(input.disabled && add.disabled && remove.disabled).toBe(true);
    await fireEvent.input(input, { target: { value: 'New' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await fireEvent.blur(input);
    await fireEvent.click(add);
    await fireEvent.click(remove);
    expect(screen.getByText('Existing')).toBeTruthy();
    expect(screen.queryByText('New')).toBeNull();
  });
});
