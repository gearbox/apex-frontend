import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import ru from '../../../messages/ru.json';
import sr from '../../../messages/sr.json';

const locales = { en, ru, sr } as const;

function internalNameValues(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return /\bapex\b/i.test(value) ? [path] : [];
  if (!value || typeof value !== 'object') return [];

  return Object.entries(value).flatMap(([key, child]) =>
    key.startsWith('admin_') ? [] : internalNameValues(child, path ? `${path}.${key}` : key),
  );
}

describe('i18n internal-name convention', () => {
  it('keeps the internal product name out of user-facing messages', () => {
    const offenders = Object.entries(locales).flatMap(([locale, messages]) =>
      internalNameValues(messages).map((key) => `${locale}:${key}`),
    );

    expect(offenders, `Internal product name found in: ${offenders.join(', ')}`).toEqual([]);
  });
});
