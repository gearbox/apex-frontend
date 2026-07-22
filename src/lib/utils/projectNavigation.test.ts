import { describe, expect, it } from 'vitest';
import { getActiveLibraryProjectId, getProjectNavigationTarget } from './projectNavigation';

describe('project navigation', () => {
  it('changes only the project filter within Library and replaces history', () => {
    const target = getProjectNavigationTarget(
      new URL('https://apex.test/app/library?source=output&favorite=true&tag=tag-1&sort=oldest'),
      'project-1',
    );

    expect(target).toEqual({
      href: '?source=output&favorite=true&tag=tag-1&sort=oldest&project=project-1',
      replaceState: true,
    });
  });

  it('removes only the project filter within Library', () => {
    expect(
      getProjectNavigationTarget(
        new URL('https://apex.test/app/library?project=project-1&query=clouds&media=image'),
        null,
      ),
    ).toEqual({ href: '?query=clouds&media=image', replaceState: true });
  });

  it('uses normal navigation from another route', () => {
    expect(
      getProjectNavigationTarget(new URL('https://apex.test/app/jobs?status=running'), 'project-1'),
    ).toEqual({ href: '/app/library?project=project-1', replaceState: false });
    expect(getProjectNavigationTarget(new URL('https://apex.test/app/jobs'), null)).toEqual({
      href: '/app/library',
      replaceState: false,
    });
  });

  it('only reports an active project while the Library route is open', () => {
    expect(
      getActiveLibraryProjectId(new URL('https://apex.test/app/library?project=project-1')),
    ).toBe('project-1');
    expect(
      getActiveLibraryProjectId(new URL('https://apex.test/app/jobs?project=project-1')),
    ).toBeNull();
  });
});
