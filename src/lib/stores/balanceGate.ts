import { billingBalanceQueryOptions as billingQueryOptions } from '$lib/queries/billing';

export const balanceQueryOptions = () => billingQueryOptions();

/** True only when the user has a positive balance that can cover new work. */
export function canStartNewWork(balance: number | null | undefined): boolean {
  return typeof balance === 'number' && balance > 0;
}
