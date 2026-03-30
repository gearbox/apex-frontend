import type { UserProfile } from '$lib/stores/auth';
import type { UserStatsResponse } from '$lib/api/user';

export function makeUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'usr_mock_001',
    email: 'test@example.com',
    display_name: 'Test User',
    role: 'user',
    subscription_tier: 'free',
    email_verified: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeUserStats(overrides?: Partial<UserStatsResponse>): UserStatsResponse {
  return {
    total_jobs: 42,
    completed_jobs: 38,
    failed_jobs: 4,
    total_outputs: 76,
    total_uploads: 12,
    storage_used_bytes: 157_286_400,
    ...overrides,
  };
}
