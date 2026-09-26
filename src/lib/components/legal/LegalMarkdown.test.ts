import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('$app/environment', () => ({ browser: true }));

import LegalMarkdown from '$lib/components/legal/LegalMarkdown.svelte';

describe('LegalMarkdown', () => {
  it('sanitizes executable markup and hardens external links', () => {
    const { container } = render(LegalMarkdown, {
      markdown:
        '[safe](https://example.com/legal)\n\n<script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a>',
    });

    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('javascript:');

    const external = container.querySelector('a[href*="example.com"]');
    expect(external?.getAttribute('target')).toBe('_blank');
    expect(external?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
