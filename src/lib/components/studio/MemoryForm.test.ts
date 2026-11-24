import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import MemoryForm from './MemoryForm.svelte';
import { MemoryDraft } from '$lib/studio/MemoryDraft.svelte';

describe('MemoryForm', () => {
  it('derives the title until edited, preserves body line breaks, and omits an undated create date', async () => {
    const onsubmit = vi.fn();
    render(MemoryForm, {
      props: { draft: new MemoryDraft('create'), idPrefix: 'create-test', onsubmit },
    });

    const body = screen.getByLabelText('What happened?');
    expect(screen.getByRole('button', { name: 'Save memory' }).hasAttribute('disabled')).toBe(true);
    await fireEvent.input(body, {
      target: { value: 'First evening in Belgrade\nRain on the windows' },
    });
    await fireEvent.click(screen.getByText('More'));
    const title = document.getElementById('create-test-title') as HTMLInputElement;
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
    const draft = new MemoryDraft('edit', {
      title: 'The first show',
      body: 'A small room.\nA warm light.',
      occurred_on: '2026-08-10',
      themes: [],
      imagery: [],
      salience: 3,
    });
    const props = { draft, idPrefix: 'edit-test', pending: true, onsubmit };
    const rendered = render(MemoryForm, { props });
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
    await rendered.rerender({ ...props, pending: false });
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

  it('opens More and shows a title issue', async () => {
    render(MemoryForm, {
      props: {
        draft: new MemoryDraft('create'),
        idPrefix: 'title-issue',
        issues: [{ path: 'title', code: 'too_long_after_normalization' }],
        onsubmit: vi.fn(),
      },
    });

    const details = screen.getByText('More').closest('details');
    const title = document.getElementById('title-issue-title') as HTMLInputElement;
    expect(details?.open).toBe(true);
    expect(screen.getByText('This value is longer than allowed.')).toBeTruthy();
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(title.getAttribute('aria-describedby')).toBe(
      'title-issue-title-issue-0 title-issue-title-count',
    );
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it('opens More for a tag issue and names the tag', async () => {
    render(MemoryForm, {
      props: {
        draft: new MemoryDraft('create'),
        idPrefix: 'tag-issue',
        issues: [{ path: 'themes[1]', code: 'duplicate_tag' }],
        onsubmit: vi.fn(),
      },
    });

    const details = screen.getByText('More').closest('details');
    const themes = screen.getByLabelText('Themes');
    expect(details?.open).toBe(true);
    expect(screen.getByText('Tag 2: This tag is already listed.')).toBeTruthy();
    expect(themes.getAttribute('aria-invalid')).toBe('true');
    expect(themes.getAttribute('aria-describedby')).toContain('tag-issue-themes-issue-0');
    await waitFor(() => expect(document.activeElement).toBe(themes));
  });

  it('a 120-emoji title is accepted and 121 disables save', async () => {
    const onsubmit = vi.fn();
    render(MemoryForm, {
      props: { draft: new MemoryDraft('create'), idPrefix: 'emoji-title', onsubmit },
    });
    const body = screen.getByLabelText('What happened?');
    const save = screen.getByRole('button', { name: 'Save memory' });

    await fireEvent.input(body, { target: { value: '🙂'.repeat(120) } });
    await fireEvent.click(screen.getByText('More'));
    const title = document.getElementById('emoji-title-title') as HTMLInputElement;
    expect(title.value).toBe('🙂'.repeat(120));
    expect(title.getAttribute('aria-describedby')).toContain('emoji-title-title-count');
    expect(save.hasAttribute('disabled')).toBe(false);

    await fireEvent.click(save);
    expect(onsubmit).toHaveBeenCalledWith(expect.objectContaining({ title: '🙂'.repeat(120) }));

    await fireEvent.input(title, { target: { value: '🙂'.repeat(121) } });
    expect(screen.getByText('121 / 120').className).toContain('text-danger');
    expect(save.hasAttribute('disabled')).toBe(true);
  });

  it('does not open More for a body-only issue', async () => {
    render(MemoryForm, {
      props: {
        draft: new MemoryDraft('create'),
        idPrefix: 'body-issue',
        issues: [{ path: 'body', code: 'too_long_after_normalization' }],
        onsubmit: vi.fn(),
      },
    });

    const details = screen.getByText('More').closest('details');
    const body = document.getElementById('body-issue-body') as HTMLTextAreaElement;
    expect(details?.open).toBe(false);
    expect(body.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(body));
  });
  it('fields are read-only while saving', async () => {
    const props = {
      draft: new MemoryDraft('create'),
      idPrefix: 'pending',
      pending: true,
      onsubmit: vi.fn(),
    };
    const rendered = render(MemoryForm, { props });
    await fireEvent.click(screen.getByText('More'));
    const body = screen.getByLabelText('What happened?') as HTMLTextAreaElement;
    const title = screen.getByLabelText('Title') as HTMLInputElement;
    const controls = [
      screen.getByLabelText('Themes'),
      screen.getByLabelText('Imagery'),
      document.getElementById('pending-date')!,
      ...screen.getAllByRole('radio'),
      screen.getByRole('button', { name: 'No date' }),
    ] as HTMLInputElement[];
    expect(body.readOnly).toBe(true);
    expect(title.readOnly).toBe(true);
    expect(controls.every((control) => control.disabled)).toBe(true);
    expect(body.closest('form')?.getAttribute('aria-busy')).toBe('true');
    await rendered.rerender({ ...props, pending: false });
    expect(body.readOnly).toBe(false);
    expect(title.readOnly).toBe(false);
    expect(controls.every((control) => !control.disabled)).toBe(true);
    expect(body.closest('form')?.hasAttribute('aria-busy')).toBe(false);
  });
  it('two forms bound to one draft stay in sync', async () => {
    const draft = new MemoryDraft('create');
    render(MemoryForm, { props: { draft, idPrefix: 'one', onsubmit: vi.fn() } });
    render(MemoryForm, { props: { draft, idPrefix: 'two', onsubmit: vi.fn() } });
    const first = document.getElementById('one-body') as HTMLTextAreaElement;
    const second = document.getElementById('two-body') as HTMLTextAreaElement;
    await fireEvent.input(first, { target: { value: 'Shared draft' } });
    expect(second.value).toBe('Shared draft');
    await fireEvent.input(second, { target: { value: 'Edited in the second form' } });
    expect(first.value).toBe('Edited in the second form');
  });
});
