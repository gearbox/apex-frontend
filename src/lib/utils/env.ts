/** Returns true when running in a browser context. */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}
