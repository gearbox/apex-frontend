import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const comparison = "const x = 'x'; if (x === 'synthara') console.log(x);";
const switchCase = "const x = 'x'; switch (x) { case 'vex': console.log(x); break; }";
async function guardErrors(code: string, filePath: string) {
  const [result] = await new ESLint().lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax');
}
describe('product branching guard', () => {
  it('blocks comparisons', async () => {
    expect(await guardErrors(comparison, 'src/lib/foo.ts')).toHaveLength(1);
  });
  it('blocks switch cases', async () => {
    expect(await guardErrors(switchCase, 'src/lib/foo.ts')).toHaveLength(1);
  });
  it('allows product code to resolve IDs', async () => {
    expect(await guardErrors(comparison, 'src/lib/product/foo.ts')).toHaveLength(0);
    expect(await guardErrors(switchCase, 'src/lib/product/foo.ts')).toHaveLength(0);
  });
  it('blocks comparisons in Svelte templates', async () => {
    expect(
      await guardErrors(
        "<script>let p = 'x';</script>{#if p === 'synthara'}yes{/if}",
        'src/lib/Foo.svelte',
      ),
    ).toHaveLength(1);
  });
});
