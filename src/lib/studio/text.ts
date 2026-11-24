/** Counts normalized Unicode code points, matching the API's text limits. */
export function codePointLength(value: string): number {
  return Array.from(value.normalize('NFC')).length;
}
