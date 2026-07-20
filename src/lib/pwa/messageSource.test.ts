import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { isPathWithinScope, isTrustedPwaMessageSender } from './messageSource';

const WORKER_ORIGIN = 'https://app.example.test';
const REGISTRATION_SCOPE = `${WORKER_ORIGIN}/app/`;
const inScopeWindowClient = {
  type: 'window',
  url: `${WORKER_ORIGIN}/app/library`,
};

interface FixtureMessageEvent {
  data: unknown;
  origin: string;
  ports: Array<{ postMessage: (message: unknown) => void }>;
  source: unknown;
  waitUntil: (promise: Promise<unknown>) => void;
}

function loadFixtureWorker(fileName: string) {
  const messageListeners = new Map<string, (event: FixtureMessageEvent) => void>();
  const skipWaiting = vi.fn(async () => undefined);
  const fixtureOrigin = 'https://fixture.example.test';
  const fixtureScope = `${fixtureOrigin}/pwa-lifecycle-fixture/`;

  vm.runInNewContext(readFileSync(`static/pwa-lifecycle-fixture/${fileName}`, 'utf8'), {
    URL,
    self: {
      addEventListener: (type: string, listener: (event: FixtureMessageEvent) => void) => {
        messageListeners.set(type, listener);
      },
      clients: { claim: vi.fn() },
      location: { origin: fixtureOrigin },
      registration: { scope: fixtureScope },
      skipWaiting,
    },
  });

  const handleMessage = messageListeners.get('message');
  if (!handleMessage) throw new Error(`Fixture ${fileName} did not register a message handler`);

  return { fixtureOrigin, fixtureScope, handleMessage, skipWaiting };
}

describe('PWA service-worker message sender validation', () => {
  it('trusts same-origin window clients inside the registration scope', () => {
    expect(
      isTrustedPwaMessageSender(
        WORKER_ORIGIN,
        inScopeWindowClient,
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(true);
  });

  it('rejects a cross-origin message or source client', () => {
    expect(
      isTrustedPwaMessageSender(
        'https://attacker.example.test',
        inScopeWindowClient,
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(false);
    expect(
      isTrustedPwaMessageSender(
        WORKER_ORIGIN,
        { type: 'window', url: 'https://attacker.example.test/app/library' },
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(false);
  });

  it('rejects window clients outside the scope, including prefix collisions', () => {
    expect(
      isTrustedPwaMessageSender(
        WORKER_ORIGIN,
        { type: 'window', url: `${WORKER_ORIGIN}/other` },
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(false);
    expect(isPathWithinScope('/application', '/app/')).toBe(false);
    expect(isPathWithinScope('/app/settings', '/app/')).toBe(true);
  });

  it('rejects missing, non-window, and malformed source clients without throwing', () => {
    expect(isTrustedPwaMessageSender(WORKER_ORIGIN, null, WORKER_ORIGIN, REGISTRATION_SCOPE)).toBe(
      false,
    );
    expect(
      isTrustedPwaMessageSender(
        WORKER_ORIGIN,
        { type: 'service_worker', url: `${WORKER_ORIGIN}/app/` },
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(false);
    expect(
      isTrustedPwaMessageSender(
        WORKER_ORIGIN,
        { type: 'window', url: 'not a URL' },
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(false);
    expect(
      isTrustedPwaMessageSender(
        WORKER_ORIGIN,
        { type: 'window' },
        WORKER_ORIGIN,
        REGISTRATION_SCOPE,
      ),
    ).toBe(false);
  });
});

describe('PWA lifecycle fixture message handlers', () => {
  it.each([
    ['sw-a.js', 'fixture-a'],
    ['sw-b.js', 'fixture-b'],
  ])('%s accepts only trusted lifecycle requests', (fileName, buildSha) => {
    const { fixtureOrigin, fixtureScope, handleMessage, skipWaiting } = loadFixtureWorker(fileName);
    const inScopeSource = { type: 'window', url: `${fixtureScope}index.html` };
    const replyPort = { postMessage: vi.fn() };

    handleMessage({
      data: { type: 'APEX_GET_BUILD_INFO' },
      origin: fixtureOrigin,
      ports: [replyPort],
      source: inScopeSource,
      waitUntil: vi.fn(),
    });
    expect(replyPort.postMessage).toHaveBeenCalledWith({ type: 'APEX_BUILD_INFO', buildSha });

    const ignoredSenders = [
      { origin: 'https://attacker.example.test', source: inScopeSource },
      { origin: fixtureOrigin, source: { type: 'window', url: `${fixtureOrigin}/outside` } },
      {
        origin: fixtureOrigin,
        source: { type: 'window', url: `${fixtureOrigin}/pwa-lifecycle-fixture-evil/` },
      },
      { origin: fixtureOrigin, source: null },
      { origin: fixtureOrigin, source: { type: 'service_worker', url: `${fixtureScope}worker` } },
      { origin: fixtureOrigin, source: { type: 'window', url: 'not a URL' } },
    ];

    for (const sender of ignoredSenders) {
      expect(() => {
        handleMessage({
          data: { type: 'APEX_GET_BUILD_INFO' },
          ...sender,
          ports: [replyPort],
          waitUntil: vi.fn(),
        });
      }).not.toThrow();
    }
    expect(replyPort.postMessage).toHaveBeenCalledTimes(1);

    expect(() => {
      handleMessage({
        data: { type: 'APEX_GET_BUILD_INFO' },
        origin: fixtureOrigin,
        ports: [],
        source: inScopeSource,
        waitUntil: vi.fn(),
      });
    }).not.toThrow();

    for (const data of [
      null,
      { type: 'APEX_ACTIVATE_UPDATE', targetBuildSha: 'different-build' },
      { type: 'SKIP_WAITING' },
    ]) {
      handleMessage({
        data,
        origin: fixtureOrigin,
        ports: [],
        source: inScopeSource,
        waitUntil: vi.fn(),
      });
    }
    expect(skipWaiting).not.toHaveBeenCalled();

    const waitUntil = vi.fn();
    handleMessage({
      data: { type: 'APEX_ACTIVATE_UPDATE', targetBuildSha: buildSha },
      origin: fixtureOrigin,
      ports: [],
      source: inScopeSource,
      waitUntil,
    });
    expect(skipWaiting).toHaveBeenCalledOnce();
    expect(waitUntil).toHaveBeenCalledOnce();
  });
});
