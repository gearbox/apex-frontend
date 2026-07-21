import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { ApiRequestError } from '$lib/api/errors';
import { makeLibraryAssetItem } from '../../../mocks/factories/library';

const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  tags: [
    {
      id: 'tag-a',
      name: 'Campaign',
      asset_count: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
}));

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn(() => ({ data: { items: state.tags }, isLoading: false, isError: false })),
  createMutation: vi.fn(() => ({ mutateAsync: state.mutateAsync, isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn(), cancelQueries: vi.fn() })),
}));

import SelectionToolbar from './SelectionToolbar.svelte';

describe('SelectionToolbar', () => {
  const selectedRefs = ['output:one', 'output:two'];
  const selectedItems = selectedRefs.map((asset_ref) =>
    makeLibraryAssetItem({ asset_ref, available_actions: ['favorite', 'delete'] }),
  );

  beforeEach(() => {
    state.mutateAsync.mockReset();
    state.mutateAsync.mockResolvedValue({ succeeded: 2, failed: 0, results: [] });
  });

  it('wires the bulk favorite operation as one request', async () => {
    render(SelectionToolbar, {
      props: {
        selectedItems,
        selectedRefs,
        projects: [],
        onclear: vi.fn(),
        onoffenders: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Favorite' }));

    expect(state.mutateAsync).toHaveBeenCalledWith({
      type: 'set_favorite',
      assetRefs: selectedRefs,
      value: true,
    });
  });

  it('surfaces 400 offenders instead of silently dropping them', async () => {
    const onoffenders = vi.fn();
    state.mutateAsync.mockRejectedValue(
      new ApiRequestError({
        error: 'bulk_invalid',
        message: 'Cannot update selection',
        status_code: 400,
        extra: { asset_refs: ['output:two'] },
      }),
    );
    render(SelectionToolbar, {
      props: { selectedItems, selectedRefs, projects: [], onclear: vi.fn(), onoffenders },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Favorite' }));

    await waitFor(() => expect(onoffenders).toHaveBeenLastCalledWith(['output:two']));
  });

  it.each([
    ['Add tags', 'add_tags'],
    ['Remove tags', 'remove_tags'],
  ] as const)('sends one %s bulk request and preserves selection', async (label, type) => {
    render(SelectionToolbar, {
      props: {
        selectedItems,
        selectedRefs,
        projects: [],
        onclear: vi.fn(),
        onoffenders: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: label }));
    await fireEvent.click(screen.getByRole('checkbox', { name: /Campaign/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Apply tags' }));

    expect(state.mutateAsync).toHaveBeenCalledWith({
      type,
      assetRefs: selectedRefs,
      tagIds: ['tag-a'],
    });
  });

  it('requires confirmation before sending a bulk delete', async () => {
    render(SelectionToolbar, {
      props: {
        selectedItems,
        selectedRefs,
        projects: [],
        onclear: vi.fn(),
        onoffenders: vi.fn(),
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete selected assets' });
    expect(within(dialog).getByText(/2 selected assets/i)).toBeTruthy();
    await fireEvent.click(within(dialog).getByText('Delete'));

    expect(state.mutateAsync).toHaveBeenCalledWith({ type: 'delete', assetRefs: selectedRefs });
  });
});
