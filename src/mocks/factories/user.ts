import type { UserProfile } from '$lib/stores/auth';

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
