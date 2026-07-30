# Playwright compatibility policy

`@playwright/test` is pinned to **1.57.0** as Apex's local compatibility baseline. It is the
last release that supports WebKit on the macOS 13 development machine, preserving pre-commit
mobile Safari regression coverage. Playwright 1.58 removes that capability while both 1.57 and
1.58 bundle WebKit 26.0, so upgrading only loses local coverage without providing a newer WebKit
engine.

Reconsider the pin only when at least one condition is true:

1. The development Mac supports the candidate Playwright release.
2. The candidate fixes an Apex-relevant WebKit, Chromium, service-worker, touch, viewport,
   media, or tracing issue.
3. A newer browser engine is needed to reproduce a production issue.
4. A reliable local replacement gives equivalent WebKit coverage before commit.

Evaluate a candidate's bundled Chromium and WebKit versions, relevant release notes and breaking
changes, supported host operating systems, local and real-device coverage, and suite compatibility
and flakiness. The scheduled latest-version CI canary is evidence for that evaluation, never an
automatic upgrade instruction.
