const BUILD_SHA = 'fixture-b';
self.addEventListener('install', () => {});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'APEX_GET_BUILD_INFO') {
    event.ports[0]?.postMessage({ type: 'APEX_BUILD_INFO', buildSha: BUILD_SHA });
  }
  // The fixture deliberately mirrors the production rule: generic legacy
  // SKIP_WAITING is ignored, and the target SHA must match this worker.
  if (event.data?.type === 'APEX_ACTIVATE_UPDATE' && event.data.targetBuildSha === BUILD_SHA) {
    event.waitUntil(self.skipWaiting());
  }
});
