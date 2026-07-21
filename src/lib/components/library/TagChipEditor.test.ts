import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';

const state = vi.hoisted(() => ({
  tags: [] as Array<{ id: string; name: string; asset_count: number }>,
  mutations: [] as Array<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean }>,
  detail: { tags: [] as Array<{ id: string; name: string }> },
  queryClient: {
    refetchQueries: vi.fn().mockResolvedValue(undefined),
    getQueryData: vi.fn(),
  },
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

import TagChipEditor from './TagChipEditor.svelte';

function tag(id: string, name: string) {
  return {
    id,
    name,
    asset_count: 0,
    created_at: '2025-06-01T12:00:00Z',
    updated_at: '2025-06-01T12:00:00Z',
  };
}

describe('TagChipEditor', () => {
  let patch = vi.fn();
  let create = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    patch = vi.fn().mockResolvedValue({});
    create = vi.fn();
    state.tags = [tag('tag-a', 'Alpha'), tag('tag-b', 'Beach')];
    state.detail = { tags: [] };
    state.queryClient.getQueryData.mockImplementation(() => state.detail);
    state.queryClient.refetchQueries.mockClear();
    state.mutations = [
      { mutateAsync: patch, isPending: false },
      { mutateAsync: create, isPending: false },
    ];
  });

  afterEach(() => vi.useRealTimers());

  it('adds and removes tags with the complete replace-set payload', async () => {
    const rendered = render(TagChipEditor, { props: { assetRef: 'output:one', tags: [] } });
    const input = screen.getByLabelText('Add a tag');

    await fireEvent.input(input, { target: { value: 'Alpha' } });
    await fireEvent.click(screen.getByRole('option', { name: /Alpha/ }));
    await vi.advanceTimersByTimeAsync(400);
    expect(patch).toHaveBeenLastCalledWith({
      assetRef: 'output:one',
      tags: [{ id: 'tag-a', name: 'Alpha' }],
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Remove tag Alpha' }));
    await vi.advanceTimersByTimeAsync(400);
    expect(patch).toHaveBeenLastCalledWith({ assetRef: 'output:one', tags: [] });
    rendered.unmount();
  });

  it('creates an inline tag before replacing the asset tag set', async () => {
    create.mockResolvedValue({
      id: 'tag-new',
      name: 'New tag',
      created_at: '2025-06-01T12:00:00Z',
      updated_at: '2025-06-01T12:00:00Z',
    });
    render(TagChipEditor, { props: { assetRef: 'upload:one', tags: [] } });

    await fireEvent.input(screen.getByLabelText('Add a tag'), { target: { value: 'New tag' } });
    await fireEvent.click(screen.getByRole('option', { name: /Create/ }));
    await vi.advanceTimersByTimeAsync(400);

    expect(create).toHaveBeenCalledWith({ name: 'New tag' });
    expect(patch).toHaveBeenCalledWith({
      assetRef: 'upload:one',
      tags: [{ id: 'tag-new', name: 'New tag' }],
    });
  });

  it('serializes rapid edits into the latest complete set', async () => {
    render(TagChipEditor, { props: { assetRef: 'output:one', tags: [] } });
    const input = screen.getByLabelText('Add a tag');

    await fireEvent.input(input, { target: { value: 'Alpha' } });
    await fireEvent.click(screen.getByRole('option', { name: /Alpha/ }));
    await fireEvent.input(input, { target: { value: 'Beach' } });
    await fireEvent.click(screen.getByRole('option', { name: /Beach/ }));
    await vi.advanceTimersByTimeAsync(400);

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith({
      assetRef: 'output:one',
      tags: [
        { id: 'tag-a', name: 'Alpha' },
        { id: 'tag-b', name: 'Beach' },
      ],
    });
  });

  it('enforces the 20-tag limit and restores chips after an error', async () => {
    const capped = render(TagChipEditor, {
      props: {
        assetRef: 'output:one',
        tags: Array.from({ length: 20 }, (_, index) => ({
          id: `tag-${index}`,
          name: `Tag ${index}`,
        })),
      },
    });
    expect(screen.queryByLabelText('Add a tag')).toBeNull();
    expect(screen.getByText('An asset can have up to 20 tags.')).toBeTruthy();
    capped.unmount();

    patch.mockRejectedValueOnce(new Error('failed'));
    state.detail = { tags: [{ id: 'tag-a', name: 'Alpha' }] };
    state.mutations = [
      { mutateAsync: patch, isPending: false },
      { mutateAsync: create, isPending: false },
    ];
    render(TagChipEditor, { props: { assetRef: 'output:one', tags: [] } });
    await fireEvent.input(screen.getByLabelText('Add a tag'), { target: { value: 'Beach' } });
    await fireEvent.click(screen.getByRole('option', { name: /Beach/ }));
    await vi.advanceTimersByTimeAsync(400);

    expect(state.queryClient.refetchQueries).toHaveBeenCalled();
    expect(screen.getByText('Alpha')).toBeTruthy();
  });
});
