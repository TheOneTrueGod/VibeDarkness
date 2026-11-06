/**
 * Which CrowdSpacing resolver is live. This file is the ONLY reader of {@link CROWD_SPACING_MODE};
 * nothing else may branch on the mode — ask the resolver instead.
 */

import type { CrowdSpacingResolver } from './CrowdSpacingResolver';
import { LegacyResolver } from './legacy/LegacyResolver';
import { MassResolver } from './mass/MassResolver';

export type CrowdSpacingMode = 'legacy' | 'mass';

/** Default resolver for new CrowdSpacingManagers. */
export const CROWD_SPACING_MODE: CrowdSpacingMode = 'mass';

export function createCrowdSpacingResolver(
    mode: CrowdSpacingMode = CROWD_SPACING_MODE,
): CrowdSpacingResolver {
    switch (mode) {
        case 'legacy':
            return new LegacyResolver();
        case 'mass':
            return new MassResolver();
    }
}
