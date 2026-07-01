import type { Unit } from './Unit';
import { getUnitSpawnDef } from './unit_defs/unitDef';

export interface SpawnRenderState {
    visible: boolean;
    yOffset: number;
    scale: number;
}

/**
 * Returns the spawn render state for a unit mid-spawn, or null when not spawning.
 * Caller applies visible, yOffset, and scale to the unit visual container.
 */
export function getSpawnRenderState(unit: Unit): SpawnRenderState | null {
    if (!unit.isSpawning()) return null;

    const spawnDef = getUnitSpawnDef(unit.characterId);

    if (spawnDef?.type === 'burstRise') {
        const duration = spawnDef.duration;
        const progress = 1 - unit.spawnTimer / duration;
        const arcFactor = 4 * progress * (1 - progress);
        return {
            visible: true,
            yOffset: -arcFactor * (spawnDef.riseHeight ?? 24),
            scale: 0.1 + 0.9 * progress,
        };
    }

    // darkVortex and default: unit hidden during spawn
    return { visible: false, yOffset: 0, scale: 1 };
}
