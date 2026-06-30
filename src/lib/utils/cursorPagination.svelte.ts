/**
 * Forward/back cursor pagination state for keyset-paginated admin lists.
 * `stack` holds the cursor of each previously-visited page so prev() can walk back.
 * Page 1's cursor is null (no cursor param), so null is a valid, intentional stack entry.
 */
export class CursorPaginator {
  #stack = $state<Array<string | null>>([]);
  current = $state<string | null>(null);

  get hasPrev(): boolean {
    return this.#stack.length > 0;
  }

  get pageNumber(): number {
    return this.#stack.length + 1;
  }

  /** Query param spread: `{ cursor }` on pages > 1, `{}` on page 1. */
  get param(): { cursor?: string } {
    return this.current ? { cursor: this.current } : {};
  }

  next(nextCursor: string | null | undefined): void {
    if (!nextCursor) return;
    this.#stack = [...this.#stack, this.current];
    this.current = nextCursor;
  }

  prev(): void {
    if (this.#stack.length === 0) return;
    this.current = this.#stack[this.#stack.length - 1];
    this.#stack = this.#stack.slice(0, -1);
  }

  reset(): void {
    this.#stack = [];
    this.current = null;
  }
}
