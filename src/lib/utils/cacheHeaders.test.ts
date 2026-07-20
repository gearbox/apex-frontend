import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Cloudflare cache headers', () => {
  it('keeps the app-version manifest and service worker out of long-lived caches', () => {
    const headers = readFileSync('static/_headers', 'utf8');
    const noStore = 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0';

    expect(headers).toContain(`/app-version.json\n  ${noStore}`);
    expect(headers).toContain(`/service-worker.js\n  ${noStore}`);
    expect(headers).toContain('/\n  Cache-Control: no-cache, must-revalidate');
    expect(headers).toContain('/*.html\n  Cache-Control: no-cache, must-revalidate');
    expect(headers).toContain('/*\n  Cache-Control: no-cache, must-revalidate');
    expect(headers).toContain(
      '/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable',
    );
  });
});
