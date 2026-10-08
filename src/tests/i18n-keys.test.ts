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

function collectMessageReferences(source: string): string[] {
  if (!/import\s+\*\s+as\s+m\s+from\s+['"]\$paraglide\/messages['"]/.test(source)) {
    return [];
  }
  return [...source.matchAll(/\bm\.([A-Za-z0-9_]+)\b/g)].map((match) => match[1]);
}

describe('translation keys', () => {
  it('keeps the English, Russian and Serbian key sets identical', () => {
    expect(localeKeys('ru')).toEqual(localeKeys('en'));
    expect(localeKeys('sr')).toEqual(localeKeys('en'));
  });

  it('references every key through Paraglide message imports', () => {
    const references = new Set(
      sourceFiles('src').flatMap((path) => collectMessageReferences(readFileSync(path, 'utf8'))),
    );
    // Dynamic access (m[key], template-literal lookups) must add an explicit key allowlist here.
    expect(localeKeys('en').filter((key) => !references.has(key))).toEqual([]);
  });

  it('collects a message function passed by reference', () => {
    const source = `import * as m from '$paraglide/messages';\nconst labels = { en: m.some_key };`;
    expect(collectMessageReferences(source)).toEqual(['some_key']);
  });

  it('ignores ordinary m properties without the Paraglide import', () => {
    expect(collectMessageReferences('const models = [{ provider: m.provider }];')).toEqual([]);
  });
});
