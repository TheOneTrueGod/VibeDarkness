/**
 * Location card system: per-character "location decks" built from quest rewards.
 * A location_encounter slot draws a random card from the deck and resolves it to that card's mission.
 * Cards can carry modifications (e.g., add_reward).
 */

import type { StoryChoiceOptionRow } from './storyTypes';
import { FOUND_BERRIES_MISSION_ID } from './WorldOfDarkness/questMissions/found_berries';
import { SURFACE_METAL_DEPOSIT_MISSION_ID } from './WorldOfDarkness/questMissions/surface_metal_deposit';

/** Tags that categorize location cards. */
export enum LocationTag {
    Plains = 'plains',
    Foraging = 'foraging',
    Mining = 'mining',
}

/** Unique identifier for a location card definition. */
export type LocationCardId = number;

/** Modification applied to a location card instance. */
export type LocationCardModification = {
    type: 'add_reward';
    slot: number;
    reward_id: number;
};

/** Static location card definition (lookup table). */
export type LocationCardDef = {
    location_card_id: LocationCardId;
    displayName: string;
    description: string;
    flavourText: string;
    missionId: string;
    location_tag: LocationTag[];
};

/** Instance of a location card owned by a player (what persists on the character). */
export type LocationCardInstance = {
    instanceId: string;
    location_card_id: LocationCardId;
    displayNameOverride?: string;
    modifications: LocationCardModification[];
};

/** Reward definition for location card modifications (a story choice option). */
export type LocationRewardDef = {
    label: string;
    option: StoryChoiceOptionRow;
};

/** Static lookup: location card definitions by id. */
export const LOCATION_CARD_DEFS: Record<LocationCardId, LocationCardDef> = {
    1: {
        location_card_id: 1,
        displayName: 'Found Berries',
        description: 'A low thicket laden with ripe berries, cool and fresh from the night air. A chance find that could sustain your party.',
        flavourText: 'Enough to matter, if you choose carefully.',
        missionId: FOUND_BERRIES_MISSION_ID,
        location_tag: [LocationTag.Plains, LocationTag.Foraging],
    },
    2: {
        location_card_id: 2,
        displayName: 'Surface Metal Deposit',
        description: 'A surface seam of metal exposed by wind and time. Raw resources waiting to be claimed by those with the will to work.',
        flavourText: 'Wind has stripped the soil from a dark seam of metal.',
        missionId: SURFACE_METAL_DEPOSIT_MISSION_ID,
        location_tag: [LocationTag.Plains, LocationTag.Mining],
    },
};

/** Static lookup: reward definitions for modifications by reward id. */
export const LOCATION_REWARD_DEFS: Record<number, LocationRewardDef> = {
    4: {
        label: 'Healing poultice',
        option: {
            id: 'location_healing_poultice',
            label: 'Make a healing poultice',
            loreTitle: 'Make a healing poultice',
            loreDescription: 'You recall what you learned about these berries — the leaves make a fine poultice. Heals 5 wounds.',
            action: { type: 'heal_wounds', amount: 5 },
        },
    },
};

/**
 * Get a location card definition by id.
 * Returns undefined if the card id is not found.
 */
export function getLocationCardDef(cardId: LocationCardId): LocationCardDef | undefined {
    return LOCATION_CARD_DEFS[cardId];
}

/**
 * Create a new location card instance with no modifications.
 */
export function createLocationCardInstance(
    locationCardId: LocationCardId,
    instanceId: string,
): LocationCardInstance {
    return {
        instanceId,
        location_card_id: locationCardId,
        modifications: [],
    };
}

/**
 * Describe a location card modification as human-readable text.
 * E.g., 'Option 3: Make a healing poultice'
 * Falls back gracefully if the reward id is unknown.
 */
export function describeLocationModification(mod: LocationCardModification): string {
    const reward = LOCATION_REWARD_DEFS[mod.reward_id];
    const optionLabel = reward?.label ?? `Unknown option (slot ${mod.slot})`;
    return `Option ${mod.slot}: ${optionLabel}`;
}

/** Generator id for location_encounter slot resolution. */
export const LOCATION_ENCOUNTER_GENERATOR_ID = 'location_encounter_v1';

/**
 * Pick a location card instance from the deck based on use count.
 * - Returns null if the deck is empty.
 * - Filters to instances with the minimum use count (no repeat until all used equally).
 * - Sorts filtered instances by instanceId (stable).
 * - Returns the instance at index Math.abs(slotSeed >>> 0) % length.
 */
export function pickLocationCardInstance(
    deck: readonly LocationCardInstance[],
    usedInstanceIds: readonly string[],
    slotSeed: number,
): LocationCardInstance | null {
    if (deck.length === 0) {
        return null;
    }

    // Count how many times each instanceId has been used.
    const useCountMap = new Map<string, number>();
    for (const id of usedInstanceIds) {
        useCountMap.set(id, (useCountMap.get(id) ?? 0) + 1);
    }

    // Find minimum use count.
    let minUseCount = Infinity;
    for (const instance of deck) {
        const useCount = useCountMap.get(instance.instanceId) ?? 0;
        if (useCount < minUseCount) {
            minUseCount = useCount;
        }
    }

    // Filter to instances with minimum use count.
    const candidates = deck.filter(
        (instance) => (useCountMap.get(instance.instanceId) ?? 0) === minUseCount,
    );

    // Sort by instanceId for stable ordering.
    candidates.sort((a, b) => a.instanceId.localeCompare(b.instanceId));

    // Index by seeded hash.
    const index = Math.abs((slotSeed >>> 0) % candidates.length);
    return candidates[index] ?? null;
}

/**
 * Add location cards to a deck, enforcing one instance per location_card_id.
 * Returns a new array with the existing instances plus any new cards not already in deck.
 * - If a location_card_id is already in the deck, the existing instance is kept untouched (modifications preserved).
 * - Skips cards whose definition cannot be found.
 * - Skips duplicates within the batch (first occurrence is kept, rest ignored).
 * - Input array is not mutated (undefined input treated as empty deck).
 * @param deck - Existing deck (undefined/null treated as empty).
 * @param locationCardIds - IDs to add.
 * @param makeInstanceId - Function to generate unique instance IDs.
 * @returns New array with updated instances (same order as input deck, new cards appended).
 */
export function addLocationCardsToDeck(
    deck: readonly LocationCardInstance[] | undefined,
    locationCardIds: readonly LocationCardId[],
    makeInstanceId: () => string,
): LocationCardInstance[] {
    const result = [...(deck ?? [])];

    // Track which card IDs are already in the deck
    const existingCardIds = new Set<LocationCardId>();
    for (const instance of result) {
        existingCardIds.add(instance.location_card_id);
    }

    // Track which card IDs we've seen in the batch to prevent duplicates
    const seenInBatch = new Set<LocationCardId>();

    for (const cardId of locationCardIds) {
        // Skip if already in deck or already processed in this batch
        if (existingCardIds.has(cardId) || seenInBatch.has(cardId)) {
            continue;
        }

        // Skip if the card definition doesn't exist.
        if (!getLocationCardDef(cardId)) {
            continue;
        }

        seenInBatch.add(cardId);
        result.push(createLocationCardInstance(cardId, makeInstanceId()));
    }

    return result;
}

/**
 * Apply location card modifications to a choice options array.
 * Each add_reward modification inserts a story choice option at the specified slot.
 * - Processes modifications sorted by ascending slot (stable ordering).
 * - If slot < options.length, replaces that index; otherwise appends.
 * - Skips unknown reward ids and duplicate option ids (idempotence).
 * - Returns a new array; input is never mutated.
 * - Undefined/empty modifications return a shallow copy of options.
 */
export function applyLocationModificationsToOptions(
    options: readonly StoryChoiceOptionRow[],
    modifications: readonly LocationCardModification[] | undefined,
): StoryChoiceOptionRow[] {
    const result = [...options];
    if (!modifications || modifications.length === 0) {
        return result;
    }

    // Sort modifications by ascending slot for stable ordering.
    const sorted = [...modifications].sort((a, b) => a.slot - b.slot);

    // Track option ids that are already in the list (for idempotence).
    const existingIds = new Set<string>(result.map((opt) => opt.id));

    for (const mod of sorted) {
        if (mod.type !== 'add_reward') {
            continue;
        }

        const reward = LOCATION_REWARD_DEFS[mod.reward_id];
        if (!reward) {
            // Unknown reward id — skip
            continue;
        }

        // Skip if the option id already exists (idempotence).
        if (existingIds.has(reward.option.id)) {
            continue;
        }

        // Replace or append based on slot index.
        if (mod.slot < result.length) {
            result[mod.slot] = reward.option;
        } else {
            result.push(reward.option);
        }

        existingIds.add(reward.option.id);
    }

    return result;
}
