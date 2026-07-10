/**
 * Canonical IDs for unit resources that serialize on checkpoints and must round-trip
 * through {@link createResourceFromId}. Add new entries here first — TypeScript will
 * flag any factory map that omits a case.
 */
export const ResourceId = {
    Light: 'light',
    Rock: 'rock',
    Ammo: 'ammo',
    Gravity: 'gravity',
    Mana: 'mana',
    Rage: 'rage',
    Resonance: 'resonance',
    MovementPoints: 'movement_points',
} as const;

export type ResourceId = (typeof ResourceId)[keyof typeof ResourceId];

/** Every {@link ResourceId} that can appear in unit checkpoint JSON. */
export const ALL_SERIALIZABLE_RESOURCE_IDS: readonly ResourceId[] = [
    ResourceId.Light,
    ResourceId.Rock,
    ResourceId.Ammo,
    ResourceId.Gravity,
    ResourceId.Mana,
    ResourceId.Rage,
    ResourceId.Resonance,
    ResourceId.MovementPoints,
];

const RESOURCE_ID_SET = new Set<string>(ALL_SERIALIZABLE_RESOURCE_IDS);

export function isResourceId(id: string): id is ResourceId {
    return RESOURCE_ID_SET.has(id);
}
