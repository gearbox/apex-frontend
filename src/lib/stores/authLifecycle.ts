/**
 * Ownership for work that is valid only for the current authenticated session.
 *
 * This module deliberately has no dependency on the auth store.  The auth store owns terminal
 * transitions and invalidates this lifecycle before it removes credentials; consumers capture an
 * epoch plus a controller and prove that their result still belongs to that epoch before writing
 * state.  Keeping it standalone prevents a store <-> API client cycle.
 */
let authEpoch = 0;
const controllers = new Set<AbortController>();

export interface AuthOperation {
  epoch: number;
  controller: AbortController;
  signal: AbortSignal;
}

export function getAuthEpoch(): number {
  return authEpoch;
}

export function isAuthEpochCurrent(epoch: number): boolean {
  return epoch === authEpoch;
}

/** Starts a new auth boundary and stops every request/timer owner from the previous one. */
export function invalidateAuthOperations(): number {
  authEpoch += 1;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  return authEpoch;
}

/** Captures the current boundary and registers an abortable owner for its lifetime. */
export function beginAuthOperation(): AuthOperation {
  const controller = new AbortController();
  controllers.add(controller);
  return { epoch: authEpoch, controller, signal: controller.signal };
}

export function finishAuthOperation(operation: AuthOperation): void {
  controllers.delete(operation.controller);
}

export function isAuthOperationCurrent(operation: AuthOperation): boolean {
  return !operation.signal.aborted && isAuthEpochCurrent(operation.epoch);
}

/** Test-only visibility for asserting every begun operation is eventually released. */
export function __getAuthOperationCountForTesting(): number {
  return controllers.size;
}

/** Test-only reset. No production transition should ever move the epoch backwards. */
export function __resetAuthLifecycleForTesting(): void {
  for (const controller of controllers) controller.abort();
  controllers.clear();
  authEpoch = 0;
}
