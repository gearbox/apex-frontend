import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';

const state = vi.hoisted(() => ({
  projects: [
    {
      id: 'project-a',
      name: 'Campaign',
      description: null,
      asset_count: 3,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  mutateAsync: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn(() => ({
    get data() {
      return { items: state.projects };
    },
    isLoading: false,
  })),
  createMutation: vi.fn(() => ({ mutateAsync: state.mutateAsync, isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import ProjectNav from './ProjectNav.svelte';

describe('ProjectNav', () => {
  beforeEach(() => {
    state.mutateAsync.mockReset();
    state.mutateAsync.mockResolvedValue({ id: 'project-new' });
  });

  it('syncs project choice through the supplied URL callback and shows counts', async () => {
    const onActiveChange = vi.fn();
    render(ProjectNav, { props: { activeProjectId: null, onActiveChange } });

    await fireEvent.click(screen.getByRole('button', { name: 'Campaign' }));
    expect(onActiveChange).toHaveBeenCalledWith('project-a');
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('creates a project and activates the returned project id', async () => {
    const onActiveChange = vi.fn();
    render(ProjectNav, { props: { activeProjectId: null, onActiveChange } });

    await fireEvent.click(screen.getAllByLabelText('New project')[0]);
    await fireEvent.input(screen.getByLabelText('Project name'), { target: { value: 'Launch' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(state.mutateAsync).toHaveBeenCalledWith({ name: 'Launch' });
    expect(onActiveChange).toHaveBeenCalledWith('project-new');
  });

  it('renames an existing project through the project mutation', async () => {
    render(ProjectNav, { props: { activeProjectId: 'project-a', onActiveChange: vi.fn() } });

    await fireEvent.click(screen.getByLabelText('Rename project: Campaign'));
    await fireEvent.input(screen.getByLabelText('Project name'), { target: { value: 'Summer' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(state.mutateAsync).toHaveBeenCalledWith({
      projectId: 'project-a',
      patch: { name: 'Summer' },
    });
  });

  it('confirms deletion with the explicit assets-kept message', async () => {
    render(ProjectNav, { props: { activeProjectId: 'project-a', onActiveChange: vi.fn() } });

    await fireEvent.click(screen.getByLabelText('Delete: Campaign'));
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    expect(within(dialog).getByText(/Assets are kept and become unassigned/i)).toBeTruthy();

    await fireEvent.click(within(dialog).getByText('Delete'));
    expect(state.mutateAsync).toHaveBeenCalledWith('project-a');
  });
});
