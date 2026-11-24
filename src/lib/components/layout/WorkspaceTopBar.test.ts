import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import WorkspaceTopBar from './WorkspaceTopBar.svelte';

afterEach(cleanup);

it('pads for the top and side safe areas', () => {
  const { container } = render(WorkspaceTopBar, {
    props: { title: 'Release', backHref: '/app/studio', backLabel: 'Back to Studio' },
  });
  const header = container.querySelector('header');
  expect(header?.getAttribute('style')).toContain('var(--safe-area-top)');
  expect(header?.getAttribute('style')).toContain('var(--safe-area-left)');
  expect(header?.getAttribute('style')).toContain('var(--safe-area-right)');
  expect(header?.getAttribute('style')).toContain('3.5rem');
  expect(screen.getByText('Release').tagName).toBe('P');
  expect(container.querySelector('h1')).toBeNull();
});
