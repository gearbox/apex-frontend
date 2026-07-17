import { keepPreviousData, type QueryClient } from '@tanstack/svelte-query';
import { generateIdempotencyKey } from '$lib/utils/idempotency';
import { billingKeys } from '$lib/queries/billing';
import {
  fetchAdminUsers,
  fetchAdminOrgs,
  fetchAdminModels,
  fetchAdminPayments,
  fetchAdminPricing,
  createPricingRule,
  patchPricingRule,
  deletePricingRule,
  patchAdminUser,
  toggleAdminModel,
  adjustAccountBalance,
  fetchAccountBalance,
  fetchAccountTransactions,
  fetchAdminList,
  grantRole,
  revokeRole,
  grantPermission,
  revokePermission,
  fetchAuditLog,
  sendBroadcast,
  fetchHealth,
  fetchHealthHistory,
  fetchPaymentProviderRegistry,
  fetchAdminCurrencyCatalog,
  refreshAdminCurrencyCatalog,
  setAdminCurrencySuppressed,
  updatePaymentProvider,
  type AuditLogPage,
  type CreatePricingRuleRequest,
  type PatchPricingRuleRequest,
  type BroadcastRequest,
  type PatchAdminUserBody,
  type PaymentProviderPatchRequest,
  type CurrencySuppressPatchRequest,
} from '$lib/api/admin';

/* ─── Query Key Factory ─── */

export const adminKeys = {
  all: ['admin'] as const,
  users: (params?: object) => ['admin', 'users', params ?? {}] as const,
  orgs: (params?: object) => ['admin', 'orgs', params ?? {}] as const,
  models: (params?: object) => ['admin', 'models', params ?? {}] as const,
  payments: (params?: object) => ['admin', 'payments', params ?? {}] as const,
  pricing: (params?: object) => ['admin', 'pricing', params ?? {}] as const,
  accountBalance: (id: string) => ['admin', 'account-balance', id] as const,
  accountTransactions: (id: string, params?: object) =>
    ['admin', 'account-txns', id, params ?? {}] as const,
  admins: () => ['admin', 'manage', 'admins'] as const,
  audit: (params?: object) => ['admin', 'manage', 'audit', params ?? {}] as const,
  health: () => ['admin', 'health'] as const,
  healthHistory: (p?: object) => ['admin', 'health', 'history', p ?? {}] as const,
  paymentProviders: () => ['admin', 'payment-providers'] as const,
  paymentCurrencies: () => ['admin', 'payment-currencies'] as const,
  paymentCurrency: (provider: string, ticker: string) =>
    ['admin', 'payment-currencies', provider, ticker] as const,
};

/* ─── Query Options ─── */

export interface AdminUsersFilters {
  is_active?: boolean;
  role?: string;
  email?: string;
  limit?: number;
  cursor?: string;
}

export function adminUsersQueryOptions(filters: AdminUsersFilters = {}) {
  return {
    queryKey: adminKeys.users(filters),
    queryFn: () => fetchAdminUsers(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  };
}

export interface AdminOrgsFilters {
  is_active?: boolean;
  limit?: number;
  cursor?: string;
}

export function adminOrgsQueryOptions(filters: AdminOrgsFilters = {}) {
  return {
    queryKey: adminKeys.orgs(filters),
    queryFn: () => fetchAdminOrgs(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
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
  cursor?: string;
}

export function adminPaymentsQueryOptions(filters: AdminPaymentsFilters = {}) {
  return {
    queryKey: adminKeys.payments(filters),
    queryFn: () => fetchAdminPayments(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  };
}

export function accountBalanceQueryOptions(accountId: string) {
  return {
    queryKey: adminKeys.accountBalance(accountId),
    queryFn: () => fetchAccountBalance(accountId),
    staleTime: 30_000,
  };
}

export function accountTransactionsQueryOptions(
  accountId: string,
  params?: { limit?: number; cursor?: string; type?: string },
) {
  return {
    queryKey: adminKeys.accountTransactions(accountId, params),
    queryFn: () => fetchAccountTransactions(accountId, params),
    staleTime: 30_000,
  };
}

/* ─── Mutation Options ─── */

export function patchAdminUserMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ userId, body }: { userId: string; body: PatchAdminUserBody }) =>
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

export interface AdminPricingFilters {
  active_only?: boolean;
}

export function adminPricingQueryOptions(filters: AdminPricingFilters = {}) {
  return {
    queryKey: adminKeys.pricing(filters),
    queryFn: () => fetchAdminPricing(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export function createPricingRuleMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (body: CreatePricingRuleRequest) => createPricingRule(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.pricing() });
    },
  };
}

export function patchPricingRuleMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ ruleId, body }: { ruleId: string; body: PatchPricingRuleRequest }) =>
      patchPricingRule(ruleId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.pricing() });
    },
  };
}

export function deletePricingRuleMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (ruleId: string) => deletePricingRule(ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.pricing() });
    },
  };
}

export function sendBroadcastMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (body: BroadcastRequest) => sendBroadcast(body, generateIdempotencyKey()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.audit() });
    },
  };
}

export function adjustBalanceMutationOptions(queryClient: QueryClient, accountId: string) {
  return {
    mutationFn: (body: { amount: number; description: string }) =>
      adjustAccountBalance(accountId, body, generateIdempotencyKey()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.accountBalance(accountId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.accountTransactions(accountId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.orgs() });
    },
  };
}

/* ─── Admin Management (Superadmin only) ─── */

export function adminListQueryOptions() {
  return {
    queryKey: adminKeys.admins(),
    queryFn: () => fetchAdminList(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export interface AuditLogFilters {
  target_user_id?: string;
  limit?: number;
}

export function auditLogQueryOptions(filters: AuditLogFilters = {}) {
  return {
    queryKey: adminKeys.audit(filters),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      fetchAuditLog({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AuditLogPage) => (last.has_more ? last.next_cursor : undefined),
    staleTime: 30_000,
  };
}

export function grantRoleMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ userId, role }: { userId: string; role: 'admin' | 'superadmin' }) =>
      grantRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.admins() });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit() });
    },
  };
}

export function revokeRoleMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (userId: string) => revokeRole(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.admins() });
      queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit() });
    },
  };
}

export function grantPermissionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ userId, permission }: { userId: string; permission: 'billing_adjust' }) =>
      grantPermission(userId, permission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.admins() });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit() });
    },
  };
}

export function revokePermissionMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ userId, permission }: { userId: string; permission: 'billing_adjust' }) =>
      revokePermission(userId, permission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.admins() });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit() });
    },
  };
}

/* ─── Health ─── */

export function adminHealthQueryOptions(refetchInterval: number | false = false) {
  return {
    queryKey: adminKeys.health(),
    queryFn: fetchHealth,
    staleTime: 15_000,
    refetchInterval,
  };
}

export function adminHealthHistoryQueryOptions(params: { limit?: number } = { limit: 60 }) {
  return {
    queryKey: adminKeys.healthHistory(params),
    queryFn: () => fetchHealthHistory(params),
    staleTime: 30_000,
  };
}

/* ─── Payment Provider Registry (Superadmin only) ─── */

export function adminPaymentProvidersQueryOptions() {
  return {
    queryKey: adminKeys.paymentProviders(),
    queryFn: () => fetchPaymentProviderRegistry(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export function adminPaymentCurrenciesQueryOptions() {
  return {
    queryKey: adminKeys.paymentCurrencies(),
    queryFn: fetchAdminCurrencyCatalog,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  };
}

export function updatePaymentProviderMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ provider, body }: { provider: string; body: PaymentProviderPatchRequest }) =>
      updatePaymentProvider(provider, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.paymentProviders() }),
  };
}

export function refreshAdminPaymentCurrenciesMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: refreshAdminCurrencyCatalog,
    retry: false,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.paymentCurrencies() }),
        queryClient.invalidateQueries({ queryKey: billingKeys.currencies() }),
      ]),
  };
}

export function setAdminCurrencySuppressedMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({
      provider,
      ticker,
      isSuppressed,
    }: {
      provider: string;
      ticker: string;
      isSuppressed: boolean;
    }) =>
      setAdminCurrencySuppressed(provider, ticker, {
        is_suppressed: isSuppressed,
      } satisfies CurrencySuppressPatchRequest),
    onSuccess: (row: Awaited<ReturnType<typeof setAdminCurrencySuppressed>>) => {
      queryClient.setQueryData(adminKeys.paymentCurrency(String(row.provider), row.ticker), row);
      queryClient.setQueryData(adminKeys.paymentCurrencies(), (rows: (typeof row)[] | undefined) =>
        rows?.map((current) =>
          current.provider === row.provider && current.ticker === row.ticker ? row : current,
        ),
      );
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.paymentCurrencies() }),
        queryClient.invalidateQueries({ queryKey: billingKeys.currencies() }),
      ]);
    },
  };
}
