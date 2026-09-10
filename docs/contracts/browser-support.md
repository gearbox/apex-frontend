# Browser support contract

## Supported runtime floor

### Primary mobile targets

- iOS and iPadOS 18.0+ in Safari and the installed standalone PWA
- Android Chromium and Android System WebView 116+

### Desktop targets

- Chrome 116+
- Edge 116+
- Firefox 124+
- Safari 18+

This is a product policy. Apex is a new application, and iOS/iPadOS releases before 18 are
intentionally unsupported. Features may use Web APIs implemented by every runtime above directly;
for example, `AbortSignal.any()` needs no compatibility shim. At the time this contract was added,
that API was available from Chrome/Edge 116, Firefox 124, and Safari/iOS Safari 17.4, so every
declared floor includes it.

## What support means

The runtime floor is separate from the build target in `vite.config.ts`. Vite transforms JavaScript
and CSS syntax but does not polyfill browser APIs. The explicit target is kept aligned with this
contract, rather than relying on a future Vite baseline.

Playwright's Chromium and WebKit projects are behavioral regression proxies. They do not certify
every historical minimum browser release. In particular, the bundled WebKit version is not the
source of the product's minimum supported iOS version; see [the Playwright policy](../playwright-policy.md).

Browsers below this floor have no compatibility guarantee, no required polyfills for new APIs, and
no guaranteed PWA behavior. Bugs reproducible only there are not release blockers unless this
policy changes. Apex does not hard-block browsers or use user-agent sniffing.

Feature detection remains appropriate for optional, permission-gated, or device-dependent features
that may not be available even in a supported browser, such as push subscriptions, installation
affordances, and camera or media APIs.
