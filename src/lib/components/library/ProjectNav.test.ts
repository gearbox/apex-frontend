import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

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
  gotoMock: vi.fn(),
  setActiveProject: vi.fn(),
  pageUrl: new URL('http://localhost/app/library'),
  activeProjectAtNavigation: null as string | null,
  selectedProject: null as string | null,
}));

vi.mock('$app/navigation', () => ({ goto: state.gotoMock }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: state.pageUrl });
      return () => {};
    },
  },
}));
vi.mock('$lib/stores/activeProject.svelte', () => ({
  activeProject: {
    get id() {
      return state.selectedProject;
    },
    set: state.setActiveProject,
  },
}));
vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn(() => ({
    get data() {
      return { items: state.projects };
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  createMutation: vi.fn(() => ({ mutateAsync: state.mutateAsync, isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import ProjectNav from './ProjectNav.svelte';

describe('ProjectNav', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    state.projects = [
      {
        id: 'project-a',
        name: 'Campaign',
        description: null,
        asset_count: 3,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    state.mutateAsync.mockReset();
    state.mutateAsync.mockResolvedValue({ id: 'project-new' });
    state.gotoMock.mockReset();
    state.setActiveProject.mockReset();
    state.selectedProject = null;
    state.activeProjectAtNavigation = null;
    state.setActiveProject.mockImplementation((projectId: string | null) => {
      state.selectedProject = projectId;
    });
    state.gotoMock.mockImplementation(() => {
      state.activeProjectAtNavigation = state.selectedProject;
    });
    state.pageUrl = new URL('http://localhost/app/library?source=output&media=image');
  });

  it('preserves Library filters, replaces history, and updates the hand-off before navigation', async () => {
    render(ProjectNav, { props: { surface: 'desktop' } });

    await fireEvent.click(screen.getByRole('button', { name: 'Campaign' }));

    expect(state.setActiveProject).toHaveBeenCalledWith('project-a');
    expect(state.activeProjectAtNavigation).toBe('project-a');
    expect(state.gotoMock).toHaveBeenCalledWith(
      '?source=output&media=image&project=project-a',
      expect.objectContaining({ replaceState: true, keepFocus: true, noScroll: true }),
    );
  });

  it('creates a project and activates the returned project id', async () => {
    render(ProjectNav, { props: { surface: 'desktop' } });

    await fireEvent.click(screen.getByLabelText('New project'));
    await fireEvent.input(screen.getByLabelText('Project name'), { target: { value: 'Launch' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(state.mutateAsync).toHaveBeenCalledWith({ name: 'Launch' });
    expect(state.setActiveProject).toHaveBeenCalledWith('project-new');
  });

  it('renames an existing project through the project mutation', async () => {
    render(ProjectNav, { props: { surface: 'desktop' } });

    await fireEvent.click(screen.getByLabelText('Rename project: Campaign'));
    await fireEvent.input(screen.getByLabelText('Project name'), { target: { value: 'Summer' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(state.mutateAsync).toHaveBeenCalledWith({
      projectId: 'project-a',
      patch: { name: 'Summer' },
    });
  });

  it('clears an active deleted project through the same route-aware navigation', async () => {
    state.pageUrl = new URL('http://localhost/app/library?project=project-a&tag=tag-1');
    render(ProjectNav, { props: { surface: 'desktop' } });

    await fireEvent.click(screen.getByLabelText('Delete: Campaign'));
    const dialog = screen.getByRole('dialog', { name: 'Delete project' });
    expect(within(dialog).getByText(/Assets are kept and become unassigned/i)).toBeTruthy();
    await fireEvent.click(within(dialog).getByText('Delete'));

    expect(state.mutateAsync).toHaveBeenCalledWith('project-a');
    expect(state.setActiveProject).toHaveBeenCalledWith(null);
    expect(state.gotoMock).toHaveBeenCalledWith(
      '?tag=tag-1',
      expect.objectContaining({ replaceState: true }),
    );
  });

  it('clears a cross-route hand-off when that project is deleted', async () => {
    state.pageUrl = new URL('http://localhost/app/create');
    state.selectedProject = 'project-a';
    render(ProjectNav, { props: { surface: 'desktop' } });

    await fireEvent.click(screen.getByLabelText('Delete: Campaign'));
    await fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete project' })).getByText('Delete'),
    );

    expect(state.setActiveProject).toHaveBeenCalledWith(null);
    expect(state.gotoMock).toHaveBeenCalledWith(
      '/app/library',
      expect.objectContaining({ replaceState: false }),
    );
  });

  it('keeps all projects in the mobile scrollable list and exposes touch actions', () => {
    state.projects = Array.from({ length: 8 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `Project ${index + 1}`,
      description: null,
      asset_count: index,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }));

    const { container } = render(ProjectNav, { props: { surface: 'mobile' } });

    expect(screen.getAllByRole('button', { name: /^Project \d/ })).toHaveLength(8);
    expect(screen.getByLabelText('Rename project: Project 8')).toBeTruthy();
    expect(screen.getByLabelText('Delete: Project 8')).toBeTruthy();
    expect(container.querySelector('.mobile-project-list')).toBeTruthy();
  });
});
