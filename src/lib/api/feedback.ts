import apiClient from '$lib/api/client';
import { throwApiError } from '$lib/api/errors';
import type { components } from '$lib/api/types';

export type FeedbackCategory = components['schemas']['FeedbackCategory'];
export type FeedbackStatus = components['schemas']['FeedbackStatus'];
export type FeedbackCreate = components['schemas']['FeedbackCreate'];
export type FeedbackCreated = components['schemas']['FeedbackCreated'];
export type FeedbackReportAdmin = components['schemas']['FeedbackReportAdmin'];
export type FeedbackAdminPatch = components['schemas']['FeedbackAdminPatch'];
export type FeedbackAdminPage =
  components['schemas']['CursorPage_src.api.schemas.feedback.FeedbackReportAdmin_'];

/** Submit a signed-in user's report. This is intentionally the only user feedback transport. */
export async function submitFeedback(body: FeedbackCreate): Promise<FeedbackCreated> {
  const { data, error, response } = await apiClient.POST('/v1/feedback', { body });
  if (error || !data)
    throwApiError(error, 'Failed to submit feedback', response.status, response.headers);
  return data as FeedbackCreated;
}

export interface AdminFeedbackFilters {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  limit?: number;
  cursor?: string;
}

export async function fetchAdminFeedback(
  filters: AdminFeedbackFilters = {},
): Promise<FeedbackAdminPage> {
  const { data, error, response } = await apiClient.GET('/v1/admin/feedback', {
    params: { query: filters },
  });
  if (error || !data)
    throwApiError(error, 'Failed to fetch feedback', response.status, response.headers);
  return data as FeedbackAdminPage;
}

export async function fetchAdminFeedbackDetail(reportId: string): Promise<FeedbackReportAdmin> {
  const { data, error, response } = await apiClient.GET('/v1/admin/feedback/{report_id}', {
    params: { path: { report_id: reportId } },
  });
  if (error || !data)
    throwApiError(error, 'Failed to fetch feedback report', response.status, response.headers);
  return data as FeedbackReportAdmin;
}

export async function patchAdminFeedback(
  reportId: string,
  body: FeedbackAdminPatch,
): Promise<FeedbackReportAdmin> {
  const { data, error, response } = await apiClient.PATCH('/v1/admin/feedback/{report_id}', {
    params: { path: { report_id: reportId } },
    body,
  });
  if (error || !data)
    throwApiError(error, 'Failed to update feedback report', response.status, response.headers);
  return data as FeedbackReportAdmin;
}
