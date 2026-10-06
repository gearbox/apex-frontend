# Client frame extraction migration validation

The browser session replaces the server job flow. The canonical backend contract is
[video-frame-extraction-fe-contract.md](../contracts/video-frame-extraction-fe-contract.md).

The OpenAPI schema was exported from the local Phase A backend application (`src.api.app`),
which exposes `MediaOriginal.duration_ms` and the optional `UploadForm` lineage fields.
Regenerate again from the deployed Phase A API before staging acceptance, and after Phase B
removes the deprecated routes. Generated Phase A frame-job and storage access types remain
until that backend removal; they have no frontend consumers.

Remaining migration search hits are intentional:

- Generated schema/types describe backend Phase A's deprecated routes.
- The canonical contract describes the routes Phase B must remove.
- `BACKEND_API_REFERENCE.md` and `apex-pwa-design.md` retain historical server API/design
  descriptions; the canonical client extraction contract supersedes those frame flows.
- URL validation tests contain rejected presigned URLs. Frame tests assert that the old
  frame endpoints are never requested.
- Thumbnail contract and CLAUDE notes describe stable content URLs and reject signed access.

## Real-device staging gate (pending)

Browser mocks do not prove real credentialed CORS or the backend's HTTP cache behavior.
Deploy Phase A, clear older site data once, and run each item on iOS standalone PWA,
Android standalone PWA, and desktop Chrome before authorizing backend Phase B:

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

This gate has not been executed by local automated tests. Backend Phase B remains gated on it.
