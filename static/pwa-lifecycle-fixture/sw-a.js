const BUILD_SHA = 'fixture-a';
self.addEventListener('install', () => {});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'APEX_GET_BUILD_INFO') {
    event.ports[0]?.postMessage({ type: 'APEX_BUILD_INFO', buildSha: BUILD_SHA });
  }
  if (event.data?.type === 'APEX_ACTIVATE_UPDATE' && event.data.targetBuildSha === BUILD_SHA) {
    event.waitUntil(self.skipWaiting());
  }
});
