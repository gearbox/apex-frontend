# Client frame extraction migration validation

The browser session replaces the server job flow. The canonical backend contract is
[video-frame-extraction-fe-contract.md](../contracts/video-frame-extraction-fe-contract.md).

## Real-device staging gate

The owner reports the real-device gate executed on iOS standalone PWA and desktop Chrome;
backend Phase B is merged at `237ca5aff61b73d630a1e1ed22ab5faa6c04fc7e` (`0.50.0`).
The owner sign-off date has not yet been supplied. Android standalone PWA is the single
open pre-launch real-device item. Browser mocks do not prove credentialed CORS or HTTP
cache behavior.

Clear site data once on each staging test device after this cleanup, which removes
pre-production client-state migration shims. Run the following checklist on Android:

- [ ] Generated MP4: six previews, scrubbing, manual add/remove, several extractions, results,
  and Use as input.
- [ ] Uploaded phone video: iPhone HEVC on iOS and Android camera video on Android.
- [ ] Play the Library video first, then extract; verify `Vary: Origin` on content responses.
- [ ] Close/reopen repeatedly; background/foreground mid-session and mid-extraction; no duplicates.
- [ ] Expired content cookie causes one proven-401 recovery and continues extraction.
- [ ] Unsupported native decode opens reporting with the source asset attached.
- [ ] Video bytes use only stable content URLs and native Range/206 requests, with no whole-video
  JS fetch, deprecated frame/storage-access endpoint, or object-storage host.
- [ ] Upload multipart includes the canonical asset ref and integer actual timestamp.
- [ ] Uploaded frames appear in the source asset's Library lineage.

Local automated tests do not replace the remaining Android real-device acceptance.

## Schema cleanup record

The cleanup schema was generated from the local backend checkout at
`237ca5aff61b73d630a1e1ed22ab5faa6c04fc7e` (`0.50.0`), preserving the existing
`http://localhost:8000` server entry. Export from the deployed staging API remains
pending its URL; verify that export matches this schema before merging.

The diff removes nine paths and twelve component schemas, adds none, and changes
no surviving path or component schema. `pnpm gen:api` removes 587 lines from the
generated types. Backend OpenAPI still reports `info.version: 0.4.4`; this backend
configuration staleness is intentionally preserved.

To export the deployed schema once its URL is available:

```bash
curl --fail "$STAGING_API_URL/docs/openapi.json" -o /tmp/apex-staging-openapi.json
```

Compare the response with `src/lib/api/schema.json`, retaining the existing local
`servers` entry, then run `pnpm gen:api` and `pnpm verify`.

## Automated cleanup verification — 2026-10-08

- `VITEST_MAX_WORKERS=2 pnpm verify`: passed, including 205 unit-test files and
  1,993 tests. Type checking reported zero errors and warnings; lint, knip,
  formatting and the production build passed.
- `pnpm test:e2e:mobile --workers=2 --reporter=line`: 118 passed, one skipped.
- `CI=true pnpm test:pwa --workers=2 --reporter=line`: ten passed without retries.

Run build and PWA preview checks sequentially: rebuilding replaces the output
files served by an active preview. These automated results do not constitute
Android real-device acceptance or supply the missing owner sign-off date.
