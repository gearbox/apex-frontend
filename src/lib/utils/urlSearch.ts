/** Return a URL copy with one query parameter removed. */
export function withoutSearchParam(url: URL, name: string): URL {
  const next = new URL(url);
  next.searchParams.delete(name);
  return next;
}
