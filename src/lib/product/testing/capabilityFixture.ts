import { setStudioCapabilityForTest, type CapabilityState } from '$lib/product/capabilities';

/** Test-only fixture for exercising capability-gated shell components. */
export function setStudioCapability(state: CapabilityState): void {
  setStudioCapabilityForTest(state);
}
