import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pushSubscription } = vi.hoisted(() => ({
  pushSubscription: { userId: 'user-a', initialSyncComplete: false },
}));

vi.mock('$lib/stores/pushSubscription.svelte', () => ({ pushSubscription }));
vi.mock('$lib/stores/pushNudge.svelte', () => ({ pushNudge: { maybeShow: vi.fn() } }));

import { pushNudgeLaunch } from './pushNudgeLaunch';
import { pushNudge } from '$lib/stores/pushNudge.svelte';

describe('pushNudgeLaunch orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushNudgeLaunch.reset();
    pushSubscription.userId = 'user-a';
    pushSubscription.initialSyncComplete = true;
  });

  it('triggers maybeShow() for a standalone authenticated user once initial sync has settled', () => {
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });

    expect(pushNudge.maybeShow).toHaveBeenCalledOnce();
  });

  it('does not trigger before initial sync settles', () => {
    pushSubscription.initialSyncComplete = false;

    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });

    expect(pushNudge.maybeShow).not.toHaveBeenCalled();
  });

  it('does not trigger outside standalone mode', () => {
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: false });

    expect(pushNudge.maybeShow).not.toHaveBeenCalled();
  });

  it('does not trigger when not authenticated or without a user id', () => {
    pushNudgeLaunch.evaluate({ userId: undefined, authenticated: true, standalone: true });
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: false, standalone: true });

    expect(pushNudge.maybeShow).not.toHaveBeenCalled();
  });

  it('evaluates only once for the same user during one session', () => {
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });

    expect(pushNudge.maybeShow).toHaveBeenCalledOnce();
  });

  it('evaluates user B independently after an account switch', () => {
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });

    // Layout resets the guard on user change before pushSubscription.init(userB) runs.
    pushNudgeLaunch.reset();
    pushSubscription.userId = 'user-b';
    pushSubscription.initialSyncComplete = true;
    pushNudgeLaunch.evaluate({ userId: 'user-b', authenticated: true, standalone: true });

    expect(pushNudge.maybeShow).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale User A completion that cannot trigger a nudge for User B', () => {
    // pushSubscription.userId has not caught up to user-b yet (stale/in-flight switch).
    pushSubscription.userId = 'user-a';
    pushSubscription.initialSyncComplete = true;

    pushNudgeLaunch.evaluate({ userId: 'user-b', authenticated: true, standalone: true });

    expect(pushNudge.maybeShow).not.toHaveBeenCalled();
  });

  it('reset() (e.g. on logout) allows the same user to be re-evaluated later', () => {
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });
    pushNudgeLaunch.reset();
    pushNudgeLaunch.evaluate({ userId: 'user-a', authenticated: true, standalone: true });

    expect(pushNudge.maybeShow).toHaveBeenCalledTimes(2);
  });
});
