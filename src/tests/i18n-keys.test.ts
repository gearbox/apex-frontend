import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'paraglide') return [];
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(?:svelte|[cm]?[jt]s)$/.test(entry.name)
        ? [path]
        : [];
  });
}

function localeKeys(locale: string): string[] {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
  return Object.keys(messages)
    .filter((key) => key !== '$schema')
    .sort();
}

describe('translation keys', () => {
  it('keeps the English, Russian and Serbian key sets identical', () => {
    expect(localeKeys('ru')).toEqual(localeKeys('en'));
    expect(localeKeys('sr')).toEqual(localeKeys('en'));
  });

  it('references every key with a direct message call', () => {
    const references = new Set(
      sourceFiles('src').flatMap((path) =>
        [...readFileSync(path, 'utf8').matchAll(/\bm\.([A-Za-z0-9_]+)\s*\(/g)].map(
          (match) => match[1],
        ),
      ),
    );
    // Dynamic message access must add an explicit key allowlist here before use.
    expect(localeKeys('en').filter((key) => !references.has(key))).toEqual([]);
  });
});
