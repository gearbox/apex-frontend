import { describe, it, expect, beforeEach } from 'vitest';
import { CursorPaginator } from './cursorPagination.svelte';

describe('CursorPaginator', () => {
  let pager: CursorPaginator;

  beforeEach(() => {
    pager = new CursorPaginator();
  });

  it('starts at page 1 with no prev and empty param', () => {
    expect(pager.hasPrev).toBe(false);
    expect(pager.pageNumber).toBe(1);
    expect(pager.param).toEqual({});
    expect(pager.current).toBeNull();
  });

  it('next() advances to page 2', () => {
    pager.next('c2');
    expect(pager.current).toBe('c2');
    expect(pager.hasPrev).toBe(true);
    expect(pager.pageNumber).toBe(2);
    expect(pager.param).toEqual({ cursor: 'c2' });
  });

  it('next(null) is a no-op', () => {
    pager.next(null);
    expect(pager.current).toBeNull();
    expect(pager.pageNumber).toBe(1);
  });

  it('next(undefined) is a no-op', () => {
    pager.next(undefined);
    expect(pager.current).toBeNull();
    expect(pager.pageNumber).toBe(1);
  });

  it('prev() after one next() returns to page 1', () => {
    pager.next('c2');
    pager.prev();
    expect(pager.current).toBeNull();
    expect(pager.hasPrev).toBe(false);
    expect(pager.pageNumber).toBe(1);
  });

  it('prev() at page 1 is a no-op', () => {
    pager.prev();
    expect(pager.pageNumber).toBe(1);
    expect(pager.current).toBeNull();
  });

  it('multi-step walk: next twice then prev lands on page 2', () => {
    pager.next('c2');
    pager.next('c3');
    pager.prev();
    expect(pager.current).toBe('c2');
    expect(pager.pageNumber).toBe(2);
  });

  it('reset() returns to initial state', () => {
    pager.next('c2');
    pager.next('c3');
    pager.reset();
    expect(pager.hasPrev).toBe(false);
    expect(pager.pageNumber).toBe(1);
    expect(pager.param).toEqual({});
    expect(pager.current).toBeNull();
  });
});
