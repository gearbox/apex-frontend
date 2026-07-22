import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeMobileNavSheet,
  mobileNavSheet,
  moreSheetOpen,
  openMoreSheet,
  openProjectsSheet,
  projectsSheetOpen,
} from './ui';

describe('mobile navigation sheet state', () => {
  beforeEach(() => closeMobileNavSheet());

  it('uses one authoritative state so Projects and More are mutually exclusive', () => {
    openProjectsSheet();
    expect(get(mobileNavSheet)).toBe('projects');
    expect(get(projectsSheetOpen)).toBe(true);
    expect(get(moreSheetOpen)).toBe(false);

    openMoreSheet();
    expect(get(mobileNavSheet)).toBe('more');
    expect(get(projectsSheetOpen)).toBe(false);
    expect(get(moreSheetOpen)).toBe(true);
  });

  it('closes the active sheet', () => {
    openProjectsSheet();
    closeMobileNavSheet();
    expect(get(mobileNavSheet)).toBeNull();
  });
});
