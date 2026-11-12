import { ApiError } from '../../../utils/ApiError.js';

/**
 * Placeholder used when a capability is turned off (e.g. AI_IMAGE_PROVIDER=none
 * because the machine has no GPU). Reports itself as unavailable and refuses
 * work with a clear message, so the rest of the app keeps working.
 */
export function createDisabledProvider({ capability, reason }) {
  const fail = () => {
    throw new ApiError(503, reason);
  };
  return {
    name: 'none',
    getStatus: async () => ({ available: false, provider: 'none', reason }),
    suggestMetadata: fail,
    generateImage: fail,
    capability,
  };
}
