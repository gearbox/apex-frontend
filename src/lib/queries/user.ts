import {
  fetchUserStats,
  changePassword,
  logoutAllDevices,
  deleteAccount,
  type ChangePasswordRequest,
} from '$lib/api/user';
import { forgotPassword } from '$lib/api/auth';

export const userKeys = {
  all: ['user'] as const,
  stats: () => [...userKeys.all, 'stats'] as const,
};

export function userStatsQueryOptions() {
  return {
    queryKey: userKeys.stats(),
    queryFn: fetchUserStats,
    staleTime: 5 * 60 * 1000, // 5 min — stats don't change rapidly
  };
}

export function changePasswordMutationOptions() {
  return {
    mutationFn: (body: ChangePasswordRequest) => changePassword(body),
  };
}

/** OAuth-only accounts use the established reset flow to create their first password. */
export function setPasswordMutationOptions() {
  return {
    mutationFn: (email: string) => forgotPassword(email),
  };
}

export function logoutAllMutationOptions() {
  return {
    mutationFn: () => logoutAllDevices(),
  };
}

export function deleteAccountMutationOptions() {
  return {
    mutationFn: () => deleteAccount(),
  };
}
