/** Propose a title from the first nonblank line, counting Unicode code points after NFC. */
export function deriveMemoryTitle(body: string): string {
  const line = body
    .normalize('NFC')
    .split(/\r?\n/)
    .find((part) => part.trim());
  if (!line) return '';
  const points = Array.from(line.trim().replace(/\s+/gu, ' '));
  if (points.length <= 120) return points.join('');
  const prefix = points.slice(0, 120);
  const boundary = prefix.lastIndexOf(' ');
  return prefix.slice(0, boundary >= 60 ? boundary : 120).join('');
}

/** Format the user's local calendar date. */
export function todayLocalIsoDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
