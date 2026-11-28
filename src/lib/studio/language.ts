export function isLanguageTag(value: string): boolean {
  return value.length <= 35 && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u.test(value);
}
