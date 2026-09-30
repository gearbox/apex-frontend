import { keepPreviousData, type QueryClient } from '@tanstack/svelte-query';
import {
  fetchAdminFeedback,
  fetchAdminFeedbackDetail,
  patchAdminFeedback,
  submitFeedback,
  type AdminFeedbackFilters,
  type FeedbackAdminPatch,
  type FeedbackCreate,
} from '$lib/api/feedback';

export const feedbackKeys = {
  all: ['feedback'] as const,
  adminAll: ['feedback', 'admin'] as const,
  adminList: (filters: AdminFeedbackFilters = {}) =>
    ['feedback', 'admin', 'list', filters] as const,
  adminDetail: (reportId: string) => ['feedback', 'admin', 'detail', reportId] as const,
};

export function adminFeedbackListQueryOptions(filters: AdminFeedbackFilters = {}) {
  return {
    queryKey: feedbackKeys.adminList(filters),
    queryFn: () => fetchAdminFeedback(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  };
}

export function adminFeedbackDetailQueryOptions(reportId: string) {
  return {
    queryKey: feedbackKeys.adminDetail(reportId),
    queryFn: () => fetchAdminFeedbackDetail(reportId),
    staleTime: 0,
    refetchOnMount: 'always' as const,
  };
}

export function submitFeedbackMutationOptions() {
  return { mutationFn: (body: FeedbackCreate) => submitFeedback(body), retry: false };
}

export function patchAdminFeedbackMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: ({ reportId, body }: { reportId: string; body: FeedbackAdminPatch }) =>
      patchAdminFeedback(reportId, body),
    onSuccess: (report: Awaited<ReturnType<typeof patchAdminFeedback>>) => {
      queryClient.setQueryData(feedbackKeys.adminDetail(report.id), report);
      return queryClient.invalidateQueries({ queryKey: feedbackKeys.adminAll });
    },
  };
}
