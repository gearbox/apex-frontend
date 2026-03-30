import {
  fetchUserStats,
  changePassword,
  logoutAllDevices,
  deleteAccount,
  type ChangePasswordRequest,
} from '$lib/api/user';

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
