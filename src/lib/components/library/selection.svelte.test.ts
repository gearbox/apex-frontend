import { describe, expect, it } from 'vitest';
import { LibrarySelection } from './selection.svelte';

describe('LibrarySelection', () => {
  it('enters, toggles, and exits selection mode', () => {
    const selection = new LibrarySelection();

    selection.enter('output:one');
    expect(selection.active).toBe(true);
    expect(selection.count).toBe(1);
    expect(selection.has('output:one')).toBe(true);

    selection.toggle('output:one');
    expect(selection.active).toBe(false);

    selection.enter('output:two');
    selection.clear();
    expect(selection.count).toBe(0);
  });

  it('persists selected refs when a later infinite-query page is selected', () => {
    const selection = new LibrarySelection();

    selection.selectPage(['output:page-one-a', 'output:page-one-b']);
    selection.selectPage(['output:page-two-a']);

    expect([...selection.refs]).toEqual([
      'output:page-one-a',
      'output:page-one-b',
      'output:page-two-a',
    ]);
  });

  it('clears when the Library filter lens changes', () => {
    const selection = new LibrarySelection();
    selection.selectPage(['upload:one', 'output:two']);

    selection.clearForFilterChange();

    expect(selection.active).toBe(false);
    expect([...selection.refs]).toEqual([]);
  });
});
