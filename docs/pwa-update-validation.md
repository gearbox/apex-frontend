# PWA update validation

## Transition from the auto-update release

The first guarded release intentionally does not accept Workbox's generic `SKIP_WAITING`
message and never calls `skipWaiting()` during worker startup. An already deployed
auto-update page can therefore leave this new worker waiting. Once every old page has
closed, the browser may activate it normally; the next launch then loads the guarded
update manager. Future releases use only `APEX_ACTIVATE_UPDATE` with the waiting
worker's exact build SHA. Do not unregister the worker or clear caches/storage during
this transition.

## iOS standalone checklist (manual)

This must be completed on a physical iOS device before release; WebKit automation is
not treated as a substitute for standalone-mode lifecycle behavior.

1. Install build A, open it from the Home Screen, and deploy build B.
2. Enter a Create draft, navigate to Profile, verify the update remains deferred, and
   confirm the draft is still present after choosing **Later**.
3. Choose **Update anyway** and verify build B loads exactly once with the draft-warning
   copy shown before activation.
4. Repeat with no draft and verify the clean update activates/reloads without needing a
   reinstall.
5. Close all standalone windows, reopen from the Home Screen, and verify the app is on
   build B and remains installed.
6. Verify an existing push subscription still receives a notification and its tap opens
   the expected route.
