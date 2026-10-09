// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as typescriptParser from '@typescript-eslint/parser';
import { parseForESLint as parseSvelte } from 'svelte-eslint-parser';
import { beforeAll, describe, expect, it } from 'vitest';

const MESSAGES_MODULE = '$paraglide/messages';

interface AstNode {
  type: string;
  loc?: { start: { line: number } };
  [key: string]: unknown;
}

interface Definition {
  type: string;
  node: AstNode;
  parent: AstNode | null;
}

interface ParsedSource {
  ast: AstNode;
  visitorKeys: Readonly<Record<string, readonly string[]>>;
  scopeManager: {
    scopes: readonly {
      variables: readonly {
        defs: readonly Definition[];
        references: readonly { identifier: AstNode }[];
      }[];
    }[];
  };
}

interface MessageUsage {
  keys: string[];
  /** `path:line` of every use of the messages namespace that is not a static `m.<key>`. */
  dynamic: string[];
}

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

function parse(path: string, source: string): ParsedSource {
  const options = {
    sourceType: 'module' as const,
    ecmaVersion: 'latest' as const,
    filePath: path,
    loc: true,
    range: true,
  };
  const result = path.endsWith('.svelte')
    ? parseSvelte(source, { ...options, parser: typescriptParser })
    : typescriptParser.parseForESLint(source, options);
  return result as unknown as ParsedSource;
}

function isMessagesNamespace(definition: Definition): boolean {
  return (
    definition.type === 'ImportBinding' &&
    definition.node.type === 'ImportNamespaceSpecifier' &&
    (definition.parent?.source as { value?: unknown } | undefined)?.value === MESSAGES_MODULE
  );
}

/**
 * Resolves uses of `import * as <alias> from '$paraglide/messages'` through scope analysis, so
 * comments, strings, template text, markup text, other objects' `.m` properties and shadowed `m`
 * bindings never count as references.
 */
function collectMessageUsage(path: string, source: string): MessageUsage {
  const { ast, scopeManager, visitorKeys } = parse(path, source);
  const references = new Set<AstNode>();
  for (const scope of scopeManager.scopes) {
    for (const variable of scope.variables) {
      if (!variable.defs.some(isMessagesNamespace)) continue;
      for (const reference of variable.references) references.add(reference.identifier);
    }
  }

  const keys: string[] = [];
  const staticReferences = new Set<AstNode>();
  const visit = (node: AstNode): void => {
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      references.has(node.object as AstNode)
    ) {
      keys.push((node.property as { name: string }).name);
      staticReferences.add(node.object as AstNode);
    }
    for (const key of visitorKeys[node.type] ?? []) {
      const child = node[key];
      for (const item of Array.isArray(child) ? child : [child]) {
        if (item && typeof (item as AstNode).type === 'string') visit(item as AstNode);
      }
    }
  };
  visit(ast);

  const dynamic = [...references]
    .filter((identifier) => !staticReferences.has(identifier))
    .map((identifier) => `${path}:${identifier.loc?.start.line ?? '?'}`);
  return { keys, dynamic };
}

const IMPORT = `import * as m from '${MESSAGES_MODULE}';\n`;
const inTs = (body: string) => collectMessageUsage('fixture.ts', IMPORT + body);
const inSvelte = (script: string, markup: string) =>
  collectMessageUsage(
    'fixture.svelte',
    `<script lang="ts">\n${IMPORT}${script}\n</script>\n${markup}`,
  );

describe('translation keys', () => {
  let usage: MessageUsage;

  beforeAll(() => {
    const files = sourceFiles('src').filter((path) =>
      readFileSync(path, 'utf8').includes(MESSAGES_MODULE),
    );
    const perFile = files.map((path) => collectMessageUsage(path, readFileSync(path, 'utf8')));
    usage = {
      keys: perFile.flatMap((file) => file.keys),
      dynamic: perFile.flatMap((file) => file.dynamic),
    };
  }, 60_000);

  it('keeps the English, Russian and Serbian key sets identical', () => {
    expect(localeKeys('ru')).toEqual(localeKeys('en'));
    expect(localeKeys('sr')).toEqual(localeKeys('en'));
  });

  it('references every key statically', () => {
    const referenced = new Set(usage.keys);
    expect(localeKeys('en').filter((key) => !referenced.has(key))).toEqual([]);
  });

  it('uses the messages namespace only through static member access', () => {
    // Dynamic access (`m[key]`, passing `m` as a value) would hide unused keys from this test.
    expect(usage.dynamic, 'replace dynamic message access with static m.<key> references').toEqual(
      [],
    );
  });

  describe('collector', () => {
    it.each([
      ['a call', 'm.live_call();', ['live_call']],
      ['a reference passed by value', 'const labels = { en: m.live_ref };', ['live_ref']],
      ['a template interpolation', 'const t = `${m.live_interp()}`;', ['live_interp']],
      ['a member chain', 'const name = m.live_chain.name;', ['live_chain']],
      ['a line comment', '// m.dead_comment', []],
      ['a block comment', '/* m.dead_block */', []],
      ['a string literal', 'const s = "m.dead_string";', []],
      ['static template text', 'const t = `m.dead_template`;', []],
      ['another object’s m property', 'declare const c: any; c.m.dead_foreign;', []],
      ['a shadowed m', 'declare const xs: any[]; xs.map((m) => m.provider);', []],
    ])('in TypeScript, handles %s', (_name, body, expected) => {
      expect(inTs(body).keys).toEqual(expected);
    });

    it('collects Svelte template and attribute references', () => {
      expect(inSvelte('', '<p title={m.live_attr()}>{m.live_template()}</p>').keys.sort()).toEqual([
        'live_attr',
        'live_template',
      ]);
    });

    it('ignores Svelte markup text, HTML comments and each-block shadowing', () => {
      const result = inSvelte(
        'declare const modes: any[];',
        '<p>m.dead_text</p><!-- m.dead_html -->{#each modes as m (m.value)}{m.label}{/each}',
      );
      expect(result).toEqual({ keys: [], dynamic: [] });
    });

    it('reports dynamic access instead of ignoring it', () => {
      expect(inTs('declare const key: string; m[key];').dynamic).toEqual(['fixture.ts:2']);
      expect(inTs('declare function f(x: unknown): void; f(m);').dynamic).toEqual(['fixture.ts:2']);
    });

    it('ignores files without the messages import', () => {
      expect(collectMessageUsage('plain.ts', 'declare const m: any; m.provider;')).toEqual({
        keys: [],
        dynamic: [],
      });
    });
  });
});
