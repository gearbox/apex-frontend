import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';

export type AdminUserResponse = components['schemas']['AdminUserResponse'];
export type AdminUserListResponse = components['schemas']['AdminUserListResponse'];
export type AdminOrgResponse = components['schemas']['AdminOrgResponse'];
export type AdminOrgListResponse = components['schemas']['AdminOrgListResponse'];
export type GenerationModelResponse = components['schemas']['GenerationModelResponse'];
export type ModelListResponse = components['schemas']['ModelListResponse'];
export type PaymentResponse = components['schemas']['PaymentResponse'];
export type PaymentListResponse = components['schemas']['PaymentListResponse'];
export type BalanceResponse = components['schemas']['BalanceResponse'];
export type TransactionResponse = components['schemas']['TransactionResponse'];
export type TransactionListResponse = components['schemas']['TransactionListResponse'];
export type AdminAdjustResponse = components['schemas']['AdminAdjustResponse'];

/* ─── Users ─── */

export async function fetchAdminUsers(params?: {
  is_active?: boolean;
  role?: string;
  email?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminUserListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/users', {
    params: { query: params },
  });
  if (error || !data) throw new Error('Failed to fetch admin users');
  return data;
}

export async function patchAdminUser(
  userId: string,
  body: { role?: string; subscription_tier?: string; is_active?: boolean },
): Promise<AdminUserResponse> {
  const { data, error } = await apiClient.PATCH('/v1/admin/users/{user_id}', {
    params: { path: { user_id: userId } },
    body: body as components['schemas']['AdminPatchUserRequest'],
  });
  if (error || !data) throw new Error('Failed to update user');
  return data;
}

export async function fetchUserAccount(userId: string): Promise<BalanceResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/users/{user_id}/account', {
    params: { path: { user_id: userId } },
  });
  if (error || !data) throw new Error('Failed to fetch user account');
  return data;
}

/* ─── Organizations ─── */

export async function fetchAdminOrgs(params?: {
  is_active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<AdminOrgListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/organizations', {
    params: { query: params },
  });
  if (error || !data) throw new Error('Failed to fetch admin organizations');
  return data;
}

export async function fetchOrgAccount(orgId: string): Promise<BalanceResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/organizations/{org_id}/account', {
    params: { path: { org_id: orgId } },
  });
  if (error || !data) throw new Error('Failed to fetch org account');
  return data;
}

/* ─── Models ─── */

export async function fetchAdminModels(params?: {
  enabled_only?: boolean;
}): Promise<ModelListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/models', {
    params: { query: params },
  });
  if (error || !data) throw new Error('Failed to fetch admin models');
  return data;
}

export async function toggleAdminModel(
  modelKey: string,
  isEnabled: boolean,
): Promise<GenerationModelResponse> {
  const { data, error } = await apiClient.PATCH('/v1/admin/models/{model_key}', {
    params: { path: { model_key: modelKey } },
    body: { is_enabled: isEnabled },
  });
  if (error || !data) throw new Error('Failed to toggle model');
  return data;
}

/* ─── Payments ─── */

export async function fetchAdminPayments(params?: {
  status?: string;
  payment_provider?: string;
  limit?: number;
  offset?: number;
}): Promise<PaymentListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/payments', {
    params: { query: params },
  });
  if (error || !data) throw new Error('Failed to fetch admin payments');
  return data;
}

export async function fetchAdminPayment(paymentId: string): Promise<PaymentResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/payments/{payment_id}', {
    params: { path: { payment_id: paymentId } },
  });
  if (error || !data) throw new Error('Failed to fetch payment');
  return data;
}

/* ─── Account Adjustment ─── */

export async function fetchAccountBalance(accountId: string): Promise<BalanceResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/accounts/{account_id}/balance', {
    params: { path: { account_id: accountId } },
  });
  if (error || !data) throw new Error('Failed to fetch account balance');
  return data;
}

export async function fetchAccountTransactions(
  accountId: string,
  params?: { limit?: number; offset?: number; type?: string },
): Promise<TransactionListResponse> {
  const { data, error } = await apiClient.GET(
    '/v1/admin/accounts/{account_id}/transactions',
    {
      params: { path: { account_id: accountId }, query: params },
    },
  );
  if (error || !data) throw new Error('Failed to fetch account transactions');
  return data;
}

export async function adjustAccountBalance(
  accountId: string,
  body: { amount: number; description: string },
): Promise<AdminAdjustResponse> {
  const { data, error } = await apiClient.POST('/v1/admin/accounts/{account_id}/adjust', {
    params: { path: { account_id: accountId } },
    body,
  });
  if (error || !data) throw new Error('Failed to adjust account balance');
  return data;
}
