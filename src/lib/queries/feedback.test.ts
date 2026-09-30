import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { feedbackReportFixture } from '../../mocks/handlers/feedback';
import { feedbackKeys, patchAdminFeedbackMutationOptions } from './feedback';

describe('patchAdminFeedbackMutationOptions()', () => {
  it('invalidates feedback lists without invalidating the detail it has just updated', async () => {
    const queryClient = new QueryClient();
    const detailKey = feedbackKeys.adminDetail(feedbackReportFixture.id);
    queryClient.setQueryData(detailKey, { stale: true });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await patchAdminFeedbackMutationOptions(queryClient).onSuccess(feedbackReportFixture);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: feedbackKeys.adminLists });
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).not.toBe(true);
  });
});
