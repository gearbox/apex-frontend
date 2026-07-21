import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const state = vi.hoisted(() => ({
  tags: [] as Array<{ id: string; name: string; asset_count: number }>,
  mutations: [] as Array<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean }>,
  queryClient: { invalidateQueries: vi.fn() },
}));

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn(() => ({
    get data() {
      return { items: state.tags };
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  })),
  createMutation: vi.fn(() => state.mutations.shift()),
  useQueryClient: vi.fn(() => state.queryClient),
}));

import TagPickerSheet from './TagPickerSheet.svelte';

function tag(index: number) {
  return {
    id: `tag-${index}`,
    name: `Tag ${index}`,
    asset_count: index,
    created_at: '2025-06-01T12:00:00Z',
    updated_at: '2025-06-01T12:00:00Z',
  };
}

describe('TagPickerSheet', () => {
  let create = vi.fn();
  let rename = vi.fn();
  let remove = vi.fn();

  beforeEach(() => {
    create = vi.fn().mockResolvedValue(tag(20));
    rename = vi.fn().mockResolvedValue(tag(0));
    remove = vi.fn().mockResolvedValue(undefined);
    state.tags = Array.from({ length: 11 }, (_, index) => tag(index));
    state.mutations = [
      { mutateAsync: create, isPending: false },
      { mutateAsync: rename, isPending: false },
      { mutateAsync: remove, isPending: false },
    ];
  });

  it('enforces the ten-tag bulk limit and submits one add-tags selection', async () => {
    const onapply = vi.fn().mockResolvedValue(true);
    render(TagPickerSheet, {
      props: { assetRefs: ['output:one', 'upload:two'], onapply, onclose: vi.fn() },
    });

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes.slice(0, 10)) await fireEvent.click(checkbox);

    expect((checkboxes[10] as HTMLInputElement).disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Apply tags' }));
    expect(onapply).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, index) => `tag-${index}`));
  });

  it('renames and deletes tags from manage mode, reporting the deleted tag to its owner', async () => {
    const onTagDeleted = vi.fn();
    render(TagPickerSheet, {
      props: { assetRefs: ['output:one'], onapply: vi.fn(), onclose: vi.fn(), onTagDeleted },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Manage tags' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Rename tag: Tag 0' }));
    await fireEvent.input(screen.getAllByLabelText('Tag name')[1], {
      target: { value: 'Renamed' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(rename).toHaveBeenCalledWith({ tagId: 'tag-0', patch: { name: 'Renamed' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Delete: Tag 1' }));
    expect(screen.getByText(/Delete this tag from 1 assets/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledWith('tag-1');
    expect(onTagDeleted).toHaveBeenCalledWith('tag-1');
  });
});
