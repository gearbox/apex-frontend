import { SvelteSet } from 'svelte/reactivity';

/** Reactive, page-independent selection for the Library grid. */
export class LibrarySelection {
  #refs = new SvelteSet<string>();

  get refs(): ReadonlySet<string> {
    return this.#refs;
  }

  get count(): number {
    return this.#refs.size;
  }

  get active(): boolean {
    return this.#refs.size > 0;
  }

  has(assetRef: string): boolean {
    return this.#refs.has(assetRef);
  }

  enter(assetRef: string): void {
    if (this.#refs.has(assetRef)) return;
    this.#refs.add(assetRef);
  }

  toggle(assetRef: string): void {
    if (this.#refs.has(assetRef)) {
      this.#refs.delete(assetRef);
    } else {
      this.enter(assetRef);
    }
  }

  selectPage(assetRefs: Iterable<string>): void {
    for (const assetRef of assetRefs) this.#refs.add(assetRef);
  }

  clear(): void {
    this.#refs.clear();
  }

  /** Filters replace the list lens, so selection must not leak across them. */
  clearForFilterChange(): void {
    this.clear();
  }
}
