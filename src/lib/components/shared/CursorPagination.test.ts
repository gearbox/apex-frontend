import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CursorPagination from './CursorPagination.svelte';

describe('CursorPagination', () => {
  it('renders page number', () => {
    render(CursorPagination, {
      props: { hasPrev: false, hasNext: false, pageNumber: 3, onprev: vi.fn(), onnext: vi.fn() },
    });
    expect(screen.getByText('Page 3')).toBeTruthy();
  });

  it('disables Prev button when hasPrev is false', () => {
    render(CursorPagination, {
      props: { hasPrev: false, hasNext: true, pageNumber: 1, onprev: vi.fn(), onnext: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /previous page/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables Prev button when hasPrev is true', () => {
    render(CursorPagination, {
      props: { hasPrev: true, hasNext: true, pageNumber: 2, onprev: vi.fn(), onnext: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /previous page/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('disables Next button when hasNext is false', () => {
    render(CursorPagination, {
      props: { hasPrev: true, hasNext: false, pageNumber: 2, onprev: vi.fn(), onnext: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /next page/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables Next button when hasNext is true', () => {
    render(CursorPagination, {
      props: { hasPrev: false, hasNext: true, pageNumber: 1, onprev: vi.fn(), onnext: vi.fn() },
    });
    const btn = screen.getByRole('button', { name: /next page/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('disables both buttons when loading is true', () => {
    render(CursorPagination, {
      props: {
        hasPrev: true,
        hasNext: true,
        pageNumber: 2,
        loading: true,
        onprev: vi.fn(),
        onnext: vi.fn(),
      },
    });
    const prev = screen.getByRole('button', { name: /previous page/i }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: /next page/i }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);
  });

  it('fires onprev when Prev is clicked', async () => {
    const onprev = vi.fn();
    render(CursorPagination, {
      props: { hasPrev: true, hasNext: true, pageNumber: 2, onprev, onnext: vi.fn() },
    });
    await fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onprev).toHaveBeenCalledOnce();
  });

  it('fires onnext when Next is clicked', async () => {
    const onnext = vi.fn();
    render(CursorPagination, {
      props: { hasPrev: false, hasNext: true, pageNumber: 1, onprev: vi.fn(), onnext },
    });
    await fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onnext).toHaveBeenCalledOnce();
  });
});
