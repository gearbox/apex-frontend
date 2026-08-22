import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { closeMobileNavSheet, mobileNavSheet } from '$lib/stores/ui';

const state = vi.hoisted(() => ({ pageUrl: new URL('http://localhost/app/create') }));

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: { url: URL }) => void) => {
      fn({ url: state.pageUrl });
      return () => {};
    },
  },
}));

import MobileBottomTabs from './MobileBottomTabs.svelte';

describe('MobileBottomTabs', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    state.pageUrl = new URL('http://localhost/app/create');
    closeMobileNavSheet();
  });

  it('orders Create, Sessions, the Library compound slot, and More', async () => {
    const { container } = render(MobileBottomTabs);
    const labels = Array.from(container.querySelectorAll('.btm-tab-label')).map((node) =>
      node.textContent?.trim(),
    );
    expect(labels).toEqual(['Create', 'Sessions', 'Library', 'More']);

    expect(screen.getByRole('link', { name: 'Sessions' }).getAttribute('href')).toBe(
      '/app/sessions',
    );
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('href')).toBe('/app/library');

    expect(screen.getByRole('link', { name: 'Create' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Sessions' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBeNull();

    const projects = screen.getByRole('button', { name: 'Projects' });
    expect(projects.getAttribute('aria-controls')).toBe('mobile-projects-sheet');
    expect(projects.getAttribute('aria-expanded')).toBe('false');
    expect(projects.getAttribute('aria-current')).toBeNull();

    await fireEvent.click(projects);
    expect(get(mobileNavSheet)).toBe('projects');
    expect(projects.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps Library primary while marking its Folder half as project-scoped', () => {
    state.pageUrl = new URL('http://localhost/app/library?project=project-1');
    const { container } = render(MobileBottomTabs);

    expect(container.querySelector('[data-testid="mobile-library-slot"]')?.classList).toContain(
      'active',
    );
    expect(screen.getByRole('button', { name: 'Projects' }).classList).toContain('project-active');
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Create' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Sessions' }).getAttribute('aria-current')).toBeNull();
  });

  it('marks Sessions as the current page when its route is active', () => {
    state.pageUrl = new URL('http://localhost/app/sessions');
    render(MobileBottomTabs);

    expect(screen.getByRole('link', { name: 'Sessions' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Create' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Library' }).getAttribute('aria-current')).toBeNull();
  });
});
