import { pushNudge } from '$lib/stores/pushNudge.svelte';
import { pushSubscription } from '$lib/stores/pushSubscription.svelte';

export interface LaunchNudgeParams {
  userId: string | undefined;
  authenticated: boolean;
  standalone: boolean;
}

/**
 * Decides *when* to evaluate the push nudge on an authenticated standalone launch —
 * once per user, only after that user's initial push sync has settled. All eligibility
 * rules (subscribed/dismissed/denied/retry) stay in pushNudge.maybeShow(); this never
 * duplicates them.
 */
export class PushNudgeLaunchOrchestrator {
  private evaluatedForUserId: string | undefined;

  /** Call on user switch, logout, or layout teardown so the next eligible user is re-evaluated. */
  reset(): void {
    this.evaluatedForUserId = undefined;
  }

  evaluate({ userId, authenticated, standalone }: LaunchNudgeParams): void {
    if (!authenticated || !userId || !standalone) return;
    if (!pushSubscription.initialSyncComplete) return;
    // A stale completion from a previous account cannot trigger this user's nudge.
    if (pushSubscription.userId !== userId) return;
    if (this.evaluatedForUserId === userId) return;

    this.evaluatedForUserId = userId;
    pushNudge.maybeShow();
  }
}

export const pushNudgeLaunch = new PushNudgeLaunchOrchestrator();
