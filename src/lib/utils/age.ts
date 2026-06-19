/** Returns true if the given ISO date (YYYY-MM-DD) is at least 18 years ago today. */
export function isAtLeast18(dateOfBirth: string): boolean {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mo = today.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 18;
}
