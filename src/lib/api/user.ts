import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { throwApiError } from '$lib/api/errors';
import type { Locale } from '$lib/stores/locale';
import type { UserProfile } from '$lib/stores/auth';

export type UserStatsResponse = components['schemas']['UserStatsResponse'];
export type DeleteAccountResponse = components['schemas']['DeleteAccountResponse'];
export type MessageResponse = components['schemas']['MessageResponse'];
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];
export type UserProfileResponse = components['schemas']['UserProfileResponse'];

export type ResendVerificationResult = { kind: 'sent' } | { kind: 'already_verified' };

export async function fetchCurrentUserProfile(): Promise<UserProfileResponse> {
  const { data, error, response } = await apiClient.GET('/v1/users/me');
  const { status, headers } = response;
  if (error || !data) throwApiError(error, 'Failed to fetch profile', status, headers);
  if ('error' in data) throwApiError(data, 'Failed to fetch profile', status, headers);
  return data;
}

export async function resendVerificationEmail(): Promise<ResendVerificationResult> {
  const { data, error, response } = await apiClient.POST('/v1/auth/resend-verification');
  const { status, headers } = response;
  if (error || !data) {
    throwApiError(error, 'Failed to resend verification email', status, headers);
  }
  if ('error' in data) {
    throwApiError(data, 'Failed to resend verification email', status, headers);
  }
  if (data.message === 'Verification email sent') return { kind: 'sent' };
  if (data.message === 'Email is already verified') return { kind: 'already_verified' };
  throwApiError(
    {
      error: 'unexpected_response',
      message: 'Unexpected response from verification endpoint',
      status_code: 200,
    },
    'Failed to resend verification email',
  );
}

export async function fetchUserStats(): Promise<UserStatsResponse> {
  const { data, error } = await apiClient.GET('/v1/users/me/stats');
  if (error || !data) throwApiError(error, 'Failed to fetch user stats');
  return data;
}

export async function changePassword(body: ChangePasswordRequest): Promise<MessageResponse> {
  const { data, error } = await apiClient.POST('/v1/users/me/password', { body });
  if (error || !data) throwApiError(error, 'Failed to change password');
  // openapi-fetch returns a union type here; narrow to MessageResponse
  if ('error' in data) throwApiError(data, 'Failed to change password');
  return data as MessageResponse;
}

export async function logoutAllDevices(): Promise<MessageResponse> {
  const { data, error } = await apiClient.POST('/v1/users/me/logout-all');
  if (error || !data) throwApiError(error, 'Failed to sign out all devices');
  return data;
}

export async function deleteAccount(): Promise<DeleteAccountResponse> {
  const { data, error } = await apiClient.DELETE('/v1/users/me');
  if (error || !data) throwApiError(error, 'Failed to delete account');
  return data;
}

/**
 * Capture date of birth and verify age. Returns the updated profile.
 * NOTE: DOB is write-once server-side; sending a different value later → 400.
 * (Alternative: for checkbox-based products send { age_confirmed: true } instead of DOB.)
 */
export async function verifyAge(dateOfBirth: string): Promise<UserProfile> {
  const { data, error } = await apiClient.PATCH('/v1/users/me', {
    body: { date_of_birth: dateOfBirth },
  });
  if (error || !data) throwApiError(error, 'Failed to verify age');
  if ('error' in data) throwApiError(data, 'Failed to verify age');
  return data;
}

/**
 * Best-effort locale sync to backend.
 * Requires a valid access token already stored in the auth store.
 * Never throws — callers are expected to fire-and-forget.
 */
export async function updateUserLocale(locale: Locale): Promise<void> {
  try {
    const { error } = await apiClient.PATCH('/v1/users/me', { body: { locale } });
    if (error && import.meta.env.DEV) {
      console.warn('updateUserLocale failed:', error);
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('updateUserLocale failed:', err);
    }
  }
}
