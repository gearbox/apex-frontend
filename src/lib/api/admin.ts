import apiClient from '$lib/api/client';
import type { components } from '$lib/api/types';
import { throwApiError } from '$lib/api/errors';

export type AdminRoleResponse = components['schemas']['AdminRoleResponse'];
export type AuditLogEntry = components['schemas']['AuditLogEntry'];
export type AuditLogPage = components['schemas']['CursorPage_src.api.schemas.admin.AuditLogEntry_'];
export type AdminUserResponse = components['schemas']['AdminUserResponse'];
export type AdminUserListResponse =
  components['schemas']['CursorPage_src.api.schemas.admin.AdminUserResponse_'];
export type AdminOrgResponse = components['schemas']['AdminOrgResponse'];
export type AdminOrgListResponse =
  components['schemas']['CursorPage_src.api.schemas.admin.AdminOrgResponse_'];
export type GenerationModelResponse = components['schemas']['GenerationModelResponse'];
export type ModelListResponse = components['schemas']['ModelListResponse'];
export type PaymentResponse = components['schemas']['PaymentResponse'];
export type PaymentListResponse =
  components['schemas']['CursorPage_src.api.schemas.billing.PaymentResponse_'];
export type BalanceResponse = components['schemas']['BalanceResponse'];
export type TransactionResponse = components['schemas']['TransactionResponse'];
export type TransactionListResponse =
  components['schemas']['CursorPage_src.api.schemas.billing.TransactionResponse_'];
export type AdminAdjustResponse = components['schemas']['AdminAdjustResponse'];
export type PricingRuleResponse = components['schemas']['PricingRuleResponse'];
export type CreatePricingRuleRequest = components['schemas']['CreatePricingRuleRequest'];
export type PatchPricingRuleRequest = components['schemas']['PatchPricingRuleRequest'];
export type BroadcastRequest = components['schemas']['SystemBroadcastRequest'];
export type DetailedHealthResponse = components['schemas']['DetailedHealthResponse'];
export type HealthSnapshotResponse = components['schemas']['HealthSnapshotResponse'];
export type PaymentProviderInfo =
  components['schemas']['services_payment_provider_state_ProviderInfo'];
export type AdminCurrency = components['schemas']['AdminCurrency'];
export type SyncResult = components['schemas']['SyncResult'];
export type PaymentProviderPatchRequest = components['schemas']['PaymentProviderPatchRequest'];
export type PatchAdminUserBody = {
  role?: string;
  subscription_tier?: string;
  is_active?: boolean;
  locale?: string;
};

/* ─── Users ─── */

export async function fetchAdminUsers(params?: {
  is_active?: boolean;
  role?: string;
  email?: string;
  limit?: number;
  cursor?: string;
}): Promise<AdminUserListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/users', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch admin users');
  return data;
}

export async function patchAdminUser(
  userId: string,
  body: PatchAdminUserBody,
): Promise<AdminUserResponse> {
  const { data, error } = await apiClient.PATCH('/v1/admin/users/{user_id}', {
    params: { path: { user_id: userId } },
    body: body as components['schemas']['AdminPatchUserRequest'],
  });
  if (error || !data) throwApiError(error, 'Failed to update user');
  return data;
}

export async function fetchUserAccount(userId: string): Promise<BalanceResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/users/{user_id}/account', {
    params: { path: { user_id: userId } },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch user account');
  return data;
}

/* ─── Organizations ─── */

export async function fetchAdminOrgs(params?: {
  is_active?: boolean;
  limit?: number;
  cursor?: string;
}): Promise<AdminOrgListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/organizations', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch admin organizations');
  return data;
}

export async function fetchOrgAccount(orgId: string): Promise<BalanceResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/organizations/{org_id}/account', {
    params: { path: { org_id: orgId } },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch org account');
  return data;
}

/* ─── Models ─── */

export async function fetchAdminModels(params?: {
  enabled_only?: boolean;
}): Promise<ModelListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/models', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch admin models');
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
  if (error || !data) throwApiError(error, 'Failed to toggle model');
  return data;
}

/* ─── Payments ─── */

export async function fetchAdminPayments(params?: {
  status?: string;
  payment_provider?: string;
  limit?: number;
  cursor?: string;
}): Promise<PaymentListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/payments', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch admin payments');
  return data;
}

export async function fetchAdminPayment(paymentId: string): Promise<PaymentResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/payments/{payment_id}', {
    params: { path: { payment_id: paymentId } },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch payment');
  return data;
}

/* ─── Account Adjustment ─── */

export async function fetchAccountBalance(accountId: string): Promise<BalanceResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/accounts/{account_id}/balance', {
    params: { path: { account_id: accountId } },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch account balance');
  return data;
}

export async function fetchAccountTransactions(
  accountId: string,
  params?: { limit?: number; cursor?: string; type?: string },
): Promise<TransactionListResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/accounts/{account_id}/transactions', {
    params: { path: { account_id: accountId }, query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch account transactions');
  return data;
}

/* ─── Pricing ─── */

export async function fetchAdminPricing(params?: {
  active_only?: boolean;
}): Promise<PricingRuleResponse[]> {
  const { data, error } = await apiClient.GET('/v1/admin/pricing', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch pricing rules');
  return data;
}

export async function createPricingRule(
  body: CreatePricingRuleRequest,
): Promise<PricingRuleResponse> {
  const { data, error } = await apiClient.POST('/v1/admin/pricing', { body });
  if (error || !data) throwApiError(error, 'Failed to create pricing rule');
  return data;
}

export async function patchPricingRule(
  ruleId: string,
  body: PatchPricingRuleRequest,
): Promise<PricingRuleResponse> {
  const { data, error } = await apiClient.PATCH('/v1/admin/pricing/{rule_id}', {
    params: { path: { rule_id: ruleId } },
    body,
  });
  if (error || !data) throwApiError(error, 'Failed to update pricing rule');
  return data;
}

export async function deletePricingRule(ruleId: string): Promise<{ message: string }> {
  const { data, error } = await apiClient.DELETE('/v1/admin/pricing/{rule_id}', {
    params: { path: { rule_id: ruleId } },
  });
  if (error || !data) throwApiError(error, 'Failed to delete pricing rule');
  return data as { message: string };
}

/* ─── Admin Management (Superadmin only) ─── */

export async function fetchAdminList(): Promise<AdminRoleResponse[]> {
  const { data, error } = await apiClient.GET('/v1/admin/manage/admins');
  if (error || !data) throwApiError(error, 'Failed to fetch admin list');
  return data as AdminRoleResponse[];
}

export async function grantRole(
  userId: string,
  role: 'admin' | 'superadmin',
): Promise<{ message: string }> {
  const { data, error } = await apiClient.POST('/v1/admin/manage/roles/{user_id}/grant', {
    params: { path: { user_id: userId } },
    body: { role } as components['schemas']['GrantRoleRequest'],
  });
  if (error || !data) throwApiError(error, 'Failed to grant role');
  return data as { message: string };
}

export async function revokeRole(userId: string): Promise<{ message: string }> {
  const { data, error } = await apiClient.POST('/v1/admin/manage/roles/{user_id}/revoke', {
    params: { path: { user_id: userId } },
  });
  if (error || !data) throwApiError(error, 'Failed to revoke role');
  return data as { message: string };
}

export async function grantPermission(
  userId: string,
  permission: 'billing_adjust',
): Promise<{ message: string }> {
  const { data, error } = await apiClient.POST('/v1/admin/manage/permissions/{user_id}/grant', {
    params: { path: { user_id: userId } },
    body: { permission } as components['schemas']['GrantPermissionRequest'],
  });
  if (error || !data) throwApiError(error, 'Failed to grant permission');
  return data as { message: string };
}

export async function revokePermission(
  userId: string,
  permission: 'billing_adjust',
): Promise<{ message: string }> {
  const { data, error } = await apiClient.POST('/v1/admin/manage/permissions/{user_id}/revoke', {
    params: { path: { user_id: userId } },
    body: { permission } as components['schemas']['GrantPermissionRequest'],
  });
  if (error || !data) throwApiError(error, 'Failed to revoke permission');
  return data as { message: string };
}

export async function fetchAuditLog(params?: {
  target_user_id?: string;
  limit?: number;
  cursor?: string;
}): Promise<AuditLogPage> {
  const { data, error } = await apiClient.GET('/v1/admin/manage/audit', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch audit log');
  return data as AuditLogPage;
}

/* ─── Health ─── */

export async function fetchHealth(): Promise<DetailedHealthResponse> {
  const { data, error } = await apiClient.GET('/v1/admin/health');
  if (error || !data) throwApiError(error, 'Failed to fetch system health');
  return data;
}

export async function fetchHealthHistory(params?: {
  after?: string;
  before?: string;
  limit?: number;
}): Promise<HealthSnapshotResponse[]> {
  const { data, error } = await apiClient.GET('/v1/admin/health/history', {
    params: { query: params },
  });
  if (error || !data) throwApiError(error, 'Failed to fetch health history');
  return data as HealthSnapshotResponse[];
}

/* ─── Payment Provider Registry (Superadmin only) ─── */

export async function fetchPaymentProviderRegistry(): Promise<PaymentProviderInfo[]> {
  const { data, error, response } = await apiClient.GET('/v1/admin/payments/providers');
  const status = response.status;
  if (error || !data) {
    throwApiError(error, 'Failed to fetch payment provider registry', status);
  }
  return [...data].sort((a, b) => a.display_order - b.display_order);
}

export async function updatePaymentProvider(
  provider: string,
  body: PaymentProviderPatchRequest,
): Promise<PaymentProviderInfo> {
  if (body.is_enabled === undefined && body.display_order === undefined) {
    throw new Error('A payment provider update needs at least one field.');
  }
  if (
    body.display_order !== undefined &&
    body.display_order !== null &&
    (body.display_order < 0 || body.display_order > 1000)
  ) {
    throw new Error('Payment provider display order must be between 0 and 1000.');
  }

  const { data, error, response } = await apiClient.PATCH(
    '/v1/admin/payments/providers/{provider}',
    {
      params: { path: { provider } },
      body,
    },
  );
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to update payment provider', status);
  return data;
}

export async function fetchAdminCurrencyCatalog(): Promise<AdminCurrency[]> {
  const { data, error, response } = await apiClient.GET('/v1/admin/payments/currencies');
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to fetch payment currency catalog', status);
  return data;
}

export async function refreshAdminCurrencyCatalog(): Promise<SyncResult[]> {
  const { data, error, response } = await apiClient.POST('/v1/admin/payments/currencies/refresh');
  const status = response.status;
  if (error || !data) throwApiError(error, 'Failed to refresh payment currency catalog', status);
  return data;
}

/* ─── Broadcast ─── */

export async function sendBroadcast(
  body: BroadcastRequest,
  idempotencyKey: string,
): Promise<{ message: string }> {
  const { data, error } = await apiClient.POST('/v1/admin/broadcast', {
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  if (error || !data) throwApiError(error, 'Failed to send broadcast');
  return data as { message: string };
}

export async function adjustAccountBalance(
  accountId: string,
  body: { amount: number; description: string },
  idempotencyKey: string,
): Promise<AdminAdjustResponse> {
  const { data, error } = await apiClient.POST('/v1/admin/accounts/{account_id}/adjust', {
    params: {
      path: { account_id: accountId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body,
  });
  if (error || !data) throwApiError(error, 'Failed to adjust account balance');
  return data;
}
