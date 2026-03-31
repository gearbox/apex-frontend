/**
 * Generate a UUIDv4 idempotency key for mutation endpoints.
 *
 * Each call returns a fresh key. The caller is responsible for:
 * - Generating one key per user-initiated action (button click)
 * - Reusing the same key if retrying the same logical action
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}
