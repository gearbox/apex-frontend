<script lang="ts">
  import { browser } from '$app/environment';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';

  let { markdown }: { markdown: string } = $props();

  // Hooks are global to a DOMPurify instance, so register this once at module evaluation rather
  // than once per document render. The browser guard also keeps static shells DOM-free.
  if (browser) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'A') return;
      const anchor = node as HTMLAnchorElement;
      const href = anchor.getAttribute('href');
      if (!href) return;

      try {
        if (new URL(href, window.location.href).origin !== window.location.origin) {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      } catch {
        // DOMPurify has already removed unsafe URLs. Ignore any malformed remainder.
      }
    });
  }

  /**
   * DOMPurify's browser builds run the hook above. Reapplying the same narrowly-scoped policy to
   * the sanitized fragment keeps the output correct in DOM shims that do not dispatch hooks
   * (notably test DOMs), without ever inspecting or inserting unsanitized markdown.
   */
  function hardenExternalLinks(sanitizedHtml: string): string {
    if (!browser) return '';
    const container = document.createElement('div');
    container.innerHTML = sanitizedHtml;
    for (const anchor of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      try {
        if (new URL(anchor.href, window.location.href).origin !== window.location.origin) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        }
      } catch {
        // Sanitization already discarded malformed/unsafe URL schemes.
      }
    }
    return container.innerHTML;
  }

  let html = $derived(
    browser
      ? hardenExternalLinks(
          DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
            USE_PROFILES: { html: true },
            // DOMPurify intentionally removes browsing contexts by default. The hook above adds
            // this only after proving the URL is external, so permit that one safe attribute.
            ADD_ATTR: ['target'],
          }),
        )
      : '',
  );
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown is DOMPurify-sanitized above. -->
<div class="legal-prose">{@html html}</div>

<style>
  .legal-prose {
    color: var(--apex-text);
    font-size: 0.95rem;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }

  .legal-prose :global(h1),
  .legal-prose :global(h2),
  .legal-prose :global(h3),
  .legal-prose :global(h4) {
    color: var(--apex-text);
    line-height: 1.25;
    margin: 2.2rem 0 0.75rem;
  }

  .legal-prose :global(h1) {
    font-size: 1.65rem;
  }

  .legal-prose :global(h2) {
    font-size: 1.3rem;
  }

  .legal-prose :global(h3) {
    font-size: 1.1rem;
  }

  .legal-prose :global(p),
  .legal-prose :global(ul),
  .legal-prose :global(ol),
  .legal-prose :global(blockquote) {
    margin: 0.9rem 0;
  }

  .legal-prose :global(ul),
  .legal-prose :global(ol) {
    padding-left: 1.5rem;
  }

  .legal-prose :global(a) {
    color: var(--apex-accent);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .legal-prose :global(blockquote) {
    border-left: 3px solid var(--apex-border-active);
    color: var(--apex-text-muted);
    padding-left: 1rem;
  }

  .legal-prose :global(code) {
    background: var(--apex-surface-hover);
    border-radius: 0.25rem;
    padding: 0.12rem 0.28rem;
  }

  .legal-prose :global(pre) {
    background: var(--apex-surface-hover);
    border-radius: 0.5rem;
    overflow-x: auto;
    padding: 0.9rem;
  }

  .legal-prose :global(table) {
    border-collapse: collapse;
    display: block;
    max-width: 100%;
    overflow-x: auto;
    white-space: nowrap;
  }

  .legal-prose :global(th),
  .legal-prose :global(td) {
    border: 1px solid var(--apex-border);
    padding: 0.55rem 0.7rem;
    text-align: left;
  }

  .legal-prose :global(th) {
    background: var(--apex-surface-hover);
  }
</style>
