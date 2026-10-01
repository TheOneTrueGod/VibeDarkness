/**
 * Pure helper for LocationCardPill: derives display data from card id and instance.
 * Testable without React.
 */

import type { LocationCardInstance } from '../../storylines/locationCards';
import { getLocationCardDef, describeLocationModification } from '../../storylines/locationCards';

export interface LocationCardPillView {
    name: string;
    description: string;
    flavourText: string;
    modifications: string[];
    tags: string[];
}

/**
 * Capitalize the first letter of a string.
 */
function capitalizeTag(tag: string): string {
    return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/**
 * Get display data for a location card pill.
 * Returns null if the card ID is not found in the definition lookup.
 * Applies any displayNameOverride from the instance.
 */
export function getLocationCardPillView(
    locationCardId: number,
    instance?: LocationCardInstance,
): LocationCardPillView | null {
    const def = getLocationCardDef(locationCardId);
    if (!def) return null;

    const name = instance?.displayNameOverride ?? def.displayName;
    const modifications = (instance?.modifications ?? []).map(describeLocationModification);
    const tags = def.location_tag.map(capitalizeTag);

    return {
        name,
        description: def.description,
        flavourText: def.flavourText,
        modifications,
        tags,
    };
}
