# PWA update validation

## Transition from the auto-update release

The first guarded release intentionally does not accept Workbox's generic `SKIP_WAITING`
message and never calls `skipWaiting()` during worker startup. An already deployed
auto-update page can therefore leave this new worker waiting. Once every old page has
closed, the browser may activate it normally; the next launch then loads the guarded
update manager. Future releases use only `APEX_ACTIVATE_UPDATE` with the waiting
worker's exact build SHA. Do not unregister the worker or clear caches/storage during
this transition.

## Installed-PWA device checklist (manual)

Complete this for PWA lifecycle releases on physical iOS and Android devices. Browser emulation,
including Playwright's Mobile Safari project, is not a substitute for an installed PWA.

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
7. On iOS, add the app to the Home Screen; on Android, install it through the browser prompt.
8. Verify the first standalone launch, safe areas, orientation changes, keyboard behavior, touch
   gestures, modal scrolling, media playback, and file selection.
9. Background and resume the app, then verify update checks, push delivery, and notification
   clicks both while open and while closed.
10. Launch offline, then verify app-shell availability. Confirm locale, login/session state, and
    other stored preferences survive restarts and expected storage eviction behavior.
