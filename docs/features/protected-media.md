# Protected media: content-cookie credentials

Generated outputs and user uploads are served by the backend content proxy at stable URLs:

```
/v1/content/outputs/{id}
/v1/content/uploads/{id}
```

The browser authenticates these reads with the HttpOnly `apex_content` cookie
(`Path=/v1/content`). The access token never goes on a `/v1/content/...` GET. It is only
used for JSON API calls and for `POST /v1/auth/content-cookie`, which re-mints the cookie.

## Trust boundary: `parseProtectedContentUrl`

`src/lib/media/protectedContent.ts` holds the only validator for `MediaObject` URLs.
`toMediaSrc()`, `imgAttrs()`, `mediaFallbackSrc()`, `posterSrc()` and every byte fetcher
go through it.

Accepted:

- a root-relative `/v1/content/{outputs|uploads}/{id}` path, where `{id}` is one segment
  that starts with an alphanumeric and contains only `[A-Za-z0-9._-]`;
- the same path written as a canonical absolute URL on the configured API origin
  (`VITE_API_BASE_URL`).

Rejected: foreign origins, protocol-relative URLs, backslashes, credentials in the URL,
query strings, fragments, whitespace, percent-encoding, dot segments, non-canonical
spellings, and every other API path.

A rejected URL resolves to `null`, and no request is made for it. `MediaImage` renders the
unavailable placeholder, `MediaVideo` renders with no `src`, and the save and progressive
fetchers fail before calling `fetch`.

No current `MediaObject` consumer needs external or public URLs. If one ever does, give it
its own resolver and keep `toMediaSrc` strict.

## Byte fetches: `fetchProtectedContent`

Scripted reads of protected bytes all call `fetchProtectedContent()`:

- frame decoding (`loadAuthenticatedMediaBlob`);
- the progressive original upgrade (`fetchOriginalBytes`);
- save/share (`fetchOriginalBlob`).

`fetchProtectedContent()` sends `credentials: 'include'` with no `Authorization` header.
`X-Product-Id` is added only in dev builds. The cache mode defaults to `no-store`.
`src/lib/media/protectedMediaInvariant.test.ts` fails if any of these paths sends a Bearer
header again.

## Recovery

| Owner                                              | Trigger                                                  | Behaviour                                                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `contentCookieService`                             | Timer (75% of lifetime), `visibilitychange`, `pageshow` | Proactive keep-alive with bounded backoff. Advances `contentCredentialsRevision` after a successful recovery.              |
| `recoverContentAccess()`                           | A consumer's actual content failure                      | One shot: re-mint, and `silentRefresh()` only after an explicit `unauthorized` re-mint. Never loops or schedules.          |
| `silentRefresh()`                                  | Rung 2 only                                              | Broad auth recovery. Ends the session on a definitive failure.                                                              |

What `recoverContentAccess()` does with each outcome:

- **Revoked session:** a session already known to be revoked (`token_reuse_detected` or
  `account_inactive`) makes no requests.
- **No escalation:** transient, rate-limited, stale, and aborted outcomes never lead to a
  refresh.
- **Session change:** if the auth epoch changes while recovery is running (logout or
  account switch), it reports `stale` and cannot affect the new session.

How each consumer uses it:

- **`MediaImage`:** runs at most one recovery cycle per URL, then reloads the exact same
  `src`/`srcset` with no cache-busting parameters. If the recovery resolves after the
  component has moved to another URL, the result is ignored. Object-URL overrides skip
  recovery.
- **`MediaVideo`:** runs at most one recovery per URL, and only for
  `MEDIA_ERR_NETWORK` or `MEDIA_ERR_SRC_NOT_SUPPORTED`. Decode and aborted errors never
  reach the auth layer. A background revision bump reloads only elements that have errored
  or are idle with no data. It never reloads healthy playback or an element that is already
  re-fetching.
- **Byte fetchers:** a 401 triggers one recovery, then one retry of the same URL.

## Caching and session isolation

- **Service worker:** it has no Workbox route for `/v1/content/...`, so private media never
  lands in script-readable Cache Storage.
- **Browser HTTP cache:** the backend controls it with `Cache-Control: private`. Logout and
  similar endpoints clear it with `Clear-Site-Data`.
- **Scripted reads:** these keep bytes only in memory (the save blob cache, and object URLs
  that are revoked when their owner tears down).

## Deployment topology

Production is same-site: the app is served from `https://vex.pics` and the API from
`https://api.vex.pics`. The `apex_content` cookie is therefore first-party on every
content request. Local dev (`localhost:5173` → `localhost:8000`) is also same-site.

Random Cloudflare `*.workers.dev` / `*.pages.dev` branch previews are cross-site relative
to `api.vex.pics`. Browsers may block third-party cookies there, and backend CORS or
product-origin policy may reject them. Content-cookie failures on those previews tell you
nothing about production. Do not relax cookie or CORS policy to make them work. Validate
content-cookie behaviour on the production topology, or on a same-site staging pair.

## Out of scope: frame-preview presigned URLs

The automatic frame-preview job still returns short-lived presigned R2 URLs
(`FramePreviewResult.frames[*].url`, `expires_in_seconds`). `FrameStrip` renders those
directly, and they never pass through `toMediaSrc`. That flow is being migrated
separately.
