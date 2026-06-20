import type { WorldModifierDef } from './types';

export interface WorldModifierSources {
    builtins?: WorldModifierDef[];
    mission?: WorldModifierDef[];
    /** Story-level or boss-script overrides; highest precedence. */
    story?: WorldModifierDef[];
}

/**
 * Merges world modifier defs from all sources with id deduplication.
 * Precedence: story > mission > builtins (later sources override earlier).
 */
export function buildWorldModifiersFromSources(sources: WorldModifierSources): WorldModifierDef[] {
    const map = new Map<string, WorldModifierDef>();

    for (const def of sources.builtins ?? []) {
        map.set(def.id, def);
    }
    for (const def of sources.mission ?? []) {
        map.set(def.id, def);
    }
    for (const def of sources.story ?? []) {
        map.set(def.id, def);
    }

    return [...map.values()];
}
