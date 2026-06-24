import apiClient from '$lib/api/client';

export const balanceQueryOptions = () => ({
  queryKey: ['balance'] as const,
  queryFn: async () => {
    const { data } = await apiClient.GET('/v1/billing/balance');
    return data ?? null;
  },
  staleTime: 30_000,
});

/** True only when the user has a positive balance that can cover new work. */
export function canStartNewWork(balance: number | null | undefined): boolean {
  return typeof balance === 'number' && balance > 0;
}
