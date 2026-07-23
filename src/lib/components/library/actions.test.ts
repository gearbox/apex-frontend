import { describe, it, expect } from 'vitest';
import { filterVisibleLibraryActions } from './actions';
import type { LibraryAction } from './actions';

describe('filterVisibleLibraryActions', () => {
  it('always removes create_variation, regardless of flf2v availability', () => {
    const actions: LibraryAction[] = ['remix', 'create_variation', 'favorite'];
    expect(filterVisibleLibraryActions(actions, { hasFlf2vModel: true })).toEqual([
      'remix',
      'favorite',
    ]);
    expect(filterVisibleLibraryActions(actions, { hasFlf2vModel: false })).toEqual([
      'remix',
      'favorite',
    ]);
  });

  it('removes first/last-frame actions when no enabled model supports flf2v', () => {
    const actions: LibraryAction[] = [
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ];
    expect(filterVisibleLibraryActions(actions, { hasFlf2vModel: false })).toEqual([
      'remix',
      'favorite',
    ]);
  });

  it('keeps first/last-frame actions when an enabled model supports flf2v', () => {
    const actions: LibraryAction[] = [
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ];
    expect(filterVisibleLibraryActions(actions, { hasFlf2vModel: true })).toEqual([
      'remix',
      'use_as_first_frame',
      'use_as_last_frame',
      'favorite',
    ]);
  });

  it('preserves the relative order of the remaining actions', () => {
    const actions: LibraryAction[] = [
      'favorite',
      'create_variation',
      'remix',
      'use_as_first_frame',
      'download',
      'delete',
    ];
    expect(filterVisibleLibraryActions(actions, { hasFlf2vModel: false })).toEqual([
      'favorite',
      'remix',
      'download',
      'delete',
    ]);
  });

  it('is a no-op for an already-clean action list', () => {
    const actions: LibraryAction[] = ['remix', 'favorite', 'download', 'delete'];
    expect(filterVisibleLibraryActions(actions, { hasFlf2vModel: false })).toEqual(actions);
  });
});
