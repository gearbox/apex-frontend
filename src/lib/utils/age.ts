/**
 * Returns true if `dateOfBirth` (a YYYY-MM-DD calendar date) is at least 18
 * years before today. Compared by calendar components, so it is independent of
 * timezone/DST. Malformed or impossible dates (and future dates) return false.
 */
export function isAtLeast18(dateOfBirth: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Reject impossible calendar dates (e.g. 2001-13-01, 2000-02-31).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return false;
  }

  // Compare against today's LOCAL calendar date, component by component.
  const now = new Date();
  let age = now.getFullYear() - year;
  const nowMonth = now.getMonth() + 1;
  const beforeBirthday = nowMonth < month || (nowMonth === month && now.getDate() < day);
  if (beforeBirthday) age--;

  return age >= 18;
}
