const BUILD_SHA = 'fixture-b';
self.addEventListener('install', () => {});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function isPathWithinScope(pathname, scopePathname) {
  const normalizedScope = scopePathname.endsWith('/') ? scopePathname : `${scopePathname}/`;
  return pathname === scopePathname || pathname.startsWith(normalizedScope);
}

function isTrustedMessageSender(event) {
  if (
    event.origin !== self.location.origin ||
    event.source === null ||
    !event.source ||
    event.source.type !== 'window'
  ) {
    return false;
  }

  try {
    const sourceUrl = new URL(event.source.url);
    const scopeUrl = new URL(self.registration.scope);
    return (
      sourceUrl.origin === scopeUrl.origin &&
      isPathWithinScope(sourceUrl.pathname, scopeUrl.pathname)
    );
  } catch {
    return false;
  }
}

self.addEventListener('message', (event) => {
  if (!isTrustedMessageSender(event)) return;

  if (event.data?.type === 'APEX_GET_BUILD_INFO') {
    const replyPort = event.ports[0];
    if (!replyPort) return;

    replyPort.postMessage({ type: 'APEX_BUILD_INFO', buildSha: BUILD_SHA });
  }
  // The fixture deliberately mirrors the production rule: generic legacy
  // SKIP_WAITING is ignored, and the target SHA must match this worker.
  if (event.data?.type === 'APEX_ACTIVATE_UPDATE' && event.data.targetBuildSha === BUILD_SHA) {
    event.waitUntil(self.skipWaiting());
  }
});
