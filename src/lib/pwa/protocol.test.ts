import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PWA_ACTIVATE_UPDATE,
  PWA_GET_BUILD_INFO,
  isMatchingPwaActivationMessage,
  isPwaClientToWorkerMessage,
  isPwaWorkerToClientMessage,
} from './protocol';

describe('PWA worker protocol', () => {
  it('accepts only valid, build-scoped activation messages', () => {
    expect(
      isMatchingPwaActivationMessage(
        { type: PWA_ACTIVATE_UPDATE, targetBuildSha: 'next456' },
        'next456',
      ),
    ).toBe(true);
    expect(
      isMatchingPwaActivationMessage(
        { type: PWA_ACTIVATE_UPDATE, targetBuildSha: 'other789' },
        'next456',
      ),
    ).toBe(false);
    expect(isMatchingPwaActivationMessage({ type: 'SKIP_WAITING' }, 'next456')).toBe(false);
    expect(isMatchingPwaActivationMessage({ type: PWA_ACTIVATE_UPDATE }, 'next456')).toBe(false);
  });

  it('validates both handshake directions without accepting malformed input', () => {
    expect(isPwaClientToWorkerMessage({ type: PWA_GET_BUILD_INFO })).toBe(true);
    expect(isPwaClientToWorkerMessage(null)).toBe(false);
    expect(isPwaWorkerToClientMessage({ type: 'APEX_BUILD_INFO', buildSha: 'next456' })).toBe(true);
    expect(isPwaWorkerToClientMessage({ type: 'APEX_BUILD_INFO', buildSha: '' })).toBe(false);
  });

  it('wires the production worker to the build-scoped predicate, never an unconditional skip', () => {
    const worker = readFileSync('src/service-worker.ts', 'utf8');
    expect(worker).toContain('event.origin !== self.location.origin');
    expect(worker).toContain('event.source === null');
    expect(worker).toContain('isTrustedPwaMessageSender(');
    expect(worker).toContain('const replyPort = event.ports[0];');
    expect(worker).toContain('if (!replyPort) return;');
    expect(worker).toContain('isMatchingPwaActivationMessage(data, __BUILD_SHA__)');
    expect(worker).toContain('event.waitUntil(self.skipWaiting())');
    expect(worker).not.toContain('self.skipWaiting();');
  });
});
