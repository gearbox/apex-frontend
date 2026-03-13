import type { QueryClient } from '@tanstack/svelte-query';
import {
  fetchAdminUsers,
  fetchAdminOrgs,
  fetchAdminModels,
  fetchAdminPayments,
  patchAdminUser,
  toggleAdminModel,
  adjustAccountBalance,
  fetchAccountBalance,
  fetchAccountTransactions,
} from '$lib/api/admin';

/* ─── Query Key Factory ─── */

export const adminKeys = {
  all: ['admin'] as const,
  users: (params?: object) => ['admin', 'users', params ?? {}] as const,
  orgs: (params?: object) => ['admin', 'orgs', params ?? {}] as const,
  models: (params?: object) => ['admin', 'models', params ?? {}] as const,
  payments: (params?: object) => ['admin', 'payments', params ?? {}] as const,
  accountBalance: (id: string) => ['admin', 'account-balance', id] as const,
  accountTransactions: (id: string, params?: object) =>
    ['admin', 'account-txns', id, params ?? {}] as const,
};

/* ─── Query Options ─── */

export interface AdminUsersFilters {
  is_active?: boolean;
  role?: string;
  email?: string;
  limit?: number;
  offset?: number;
}

export function adminUsersQueryOptions(filters: AdminUsersFilters = {}) {
  return {
    queryKey: adminKeys.users(filters),
    queryFn: () => fetchAdminUsers(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export interface AdminOrgsFilters {
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export function adminOrgsQueryOptions(filters: AdminOrgsFilters = {}) {
  return {
    queryKey: adminKeys.orgs(filters),
    queryFn: () => fetchAdminOrgs(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export interface AdminModelsFilters {
  enabled_only?: boolean;
}

export function adminModelsQueryOptions(filters: AdminModelsFilters = {}) {
  return {
    queryKey: adminKeys.models(filters),
    queryFn: () => fetchAdminModels(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export interface AdminPaymentsFilters {
  status?: string;
  payment_provider?: string;
  limit?: number;
  offset?: number;
}

export function adminPaymentsQueryOptions(filters: AdminPaymentsFilters = {}) {
  return {
    queryKey: adminKeys.payments(filters),
    queryFn: () => fetchAdminPayments(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export function accountBalanceQueryOptions(accountId: string) {
  return {
    queryKey: adminKeys.accountBalance(accountId),
    queryFn: () => fetchAccountBalance(accountId),
    staleTime: 30_000,
  };
}

export function accountTransactionsQueryOptions(accountId: string, params?: object) {
  return {
    queryKey: adminKeys.accountTransactions(accountId, params),
    queryFn: () => fetchAccountTransactions(accountId, params as { limit?: number; offset?: number; type?: string }),
    staleTime: 30_000,
  };
}

/* ─── Mutation Options ─── */

export function patchAdminUserMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ userId, body }: { userId: string; body: { role?: string; subscription_tier?: string; is_active?: boolean } }) =>
      patchAdminUser(userId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  };
}

export function toggleAdminModelMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ modelKey, isEnabled }: { modelKey: string; isEnabled: boolean }) =>
      toggleAdminModel(modelKey, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.models() });
    },
  };
}

export function adjustBalanceMutationOptions(
  queryClient: QueryClient,
  accountId: string,
) {
  return {
    mutationFn: (body: { amount: number; description: string }) =>
      adjustAccountBalance(accountId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.accountBalance(accountId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.accountTransactions(accountId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.orgs() });
    },
  };
}
