import type { Resource } from './Resource';
import { Ammo } from './Ammo';
import { Gravity } from './Gravity';
import { Light } from './Light';
import { Mana } from './Mana';
import { Movement } from './Movement';
import { Rage } from './Rage';
import { Resonance } from './Resonance';
import { Rock } from './Rock';
import { isResourceId, type ResourceId } from './resourceIds';

/**
 * Factory for every {@link ResourceId}. The mapped type requires an entry per ID so
 * adding a resource without a factory is a compile error.
 */
const RESOURCE_FACTORIES: { [K in ResourceId]: () => Resource } = {
    light: () => new Light(),
    rock: () => new Rock(),
    ammo: () => new Ammo(),
    gravity: () => new Gravity(),
    mana: () => new Mana(),
    rage: () => new Rage(),
    resonance: () => new Resonance(),
    movement_points: () => new Movement(),
};

/** Instantiate a fresh resource for checkpoint restore. Returns null for unknown IDs. */
export function createResourceFromId(id: string): Resource | null {
    if (!isResourceId(id)) {
        return null;
    }
    return RESOURCE_FACTORIES[id]();
}
