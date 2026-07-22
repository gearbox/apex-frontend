import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
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
  beforeEach(() => closeMobileNavSheet());

  it('orders Create, Library, Projects, and More, and opens Projects as an action', async () => {
    const { container } = render(MobileBottomTabs);
    const labels = Array.from(container.querySelectorAll('.btm-tab-label')).map((node) =>
      node.textContent?.trim(),
    );
    expect(labels).toEqual(['Create', 'Library', 'Projects', 'More']);

    const projects = screen.getByRole('button', { name: 'Projects' });
    expect(projects.getAttribute('aria-controls')).toBe('mobile-projects-sheet');
    expect(projects.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(projects);
    expect(get(mobileNavSheet)).toBe('projects');
    expect(projects.getAttribute('aria-expanded')).toBe('true');
  });
});
