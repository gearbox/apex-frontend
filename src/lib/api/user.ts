import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { parseApiError, ApiRequestError } from '$lib/api/errors';

function throwApiError(error: unknown, fallbackMsg: string): never {
  const apiErr = parseApiError(error, 0);
  throw new ApiRequestError({ ...apiErr, message: apiErr.message || fallbackMsg });
}

export type UserStatsResponse = components['schemas']['UserStatsResponse'];
export type DeleteAccountResponse = components['schemas']['DeleteAccountResponse'];
export type MessageResponse = components['schemas']['MessageResponse'];
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];

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
