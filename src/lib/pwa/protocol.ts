/**
 * The only page-to-worker protocol used for the Apex update lifecycle.
 * Keep this module free of browser-only globals so it can be shared safely.
 */
export const PWA_GET_BUILD_INFO = 'APEX_GET_BUILD_INFO';
export const PWA_BUILD_INFO = 'APEX_BUILD_INFO';
export const PWA_ACTIVATE_UPDATE = 'APEX_ACTIVATE_UPDATE';

export type PwaClientToWorkerMessage =
  | { type: typeof PWA_GET_BUILD_INFO }
  | { type: typeof PWA_ACTIVATE_UPDATE; targetBuildSha: string };

export interface PwaWorkerToClientMessage {
  type: typeof PWA_BUILD_INFO;
  buildSha: string;
}

function isBuildSha(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && /^[a-zA-Z0-9._-]+$/.test(value);
}

export function isPwaClientToWorkerMessage(value: unknown): value is PwaClientToWorkerMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === PWA_GET_BUILD_INFO ||
    (message.type === PWA_ACTIVATE_UPDATE && isBuildSha(message.targetBuildSha))
  );
}

export function isPwaWorkerToClientMessage(value: unknown): value is PwaWorkerToClientMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return message.type === PWA_BUILD_INFO && isBuildSha(message.buildSha);
}

/** The worker uses this exact predicate before it is allowed to skip waiting. */
export function isMatchingPwaActivationMessage(value: unknown, buildSha: string): boolean {
  return (
    isPwaClientToWorkerMessage(value) &&
    value.type === PWA_ACTIVATE_UPDATE &&
    value.targetBuildSha === buildSha
  );
}
