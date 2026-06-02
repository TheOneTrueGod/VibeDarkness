/**
 * Lanternite — two light pulses per round (round start + midpoint), Soul Sap, torch follows the creature.
 */

import type { Unit } from '../units/Unit';
import type { EventBus } from '../EventBus';
import type { LanterniteNestMissionConfig } from '../../storylines/types';
import { LightSource } from '../lightSources/LightSource';

export const LANTERNITE_CHARACTER_ID = 'lanternite';
export const LANTERNITE_NEST_CHARACTER_ID = 'lanternite_nest';
export const LANTERNITE_SOUL_SAP_MAX_HP_FRACTION = 0.07;
export const LANTERNITE_RESPAWN_DELAY_SEC = 3;
export const LANTERNITE_TORCH_LIGHT = 4;
export const LANTERNITE_TORCH_RADIUS_TILES = 3;
export const LANTERNITE_NEST_LIGHT = 6;
export const LANTERNITE_NEST_RADIUS_TILES = 3;

function killUnit(unit: Unit, eventBus: EventBus): void {
    if (!unit.isAlive()) return;
    unit.hp = 0;
    unit.active = false;
    eventBus.emit('unit_died', {
        unitId: unit.id,
        killerUnitId: null,
    });
}

function applySoulSap(lanternite: Unit, eventBus: EventBus): void {
    const loss = Math.max(1, Math.floor(lanternite.maxHp * LANTERNITE_SOUL_SAP_MAX_HP_FRACTION));
    const nextMax = lanternite.maxHp - loss;
    if (nextMax < 1) {
        killUnit(lanternite, eventBus);
        return;
    }
    lanternite.maxHp = nextMax;
    lanternite.hp = Math.min(lanternite.hp, lanternite.maxHp);
}

/** Remove lantern glow owned by this lantern unit (call on death before respawn bookkeeping). */
export function removeLanterniteLightSources(ownerLanternUnitId: string, lightSources: LightSource[]): void {
    const torchId = `lantern_torch_${ownerLanternUnitId}`;
    for (const ls of lightSources) {
        if (ls.id === torchId) ls.active = false;
    }
}

function upsertLanternLightSource(args: {
    lanternite: Unit;
    addLightSource: (ls: LightSource) => void;
    lightSources: LightSource[];
}): void {
    const torchId = `lantern_torch_${args.lanternite.id}`;
    for (const ls of args.lightSources) {
        if (ls.id === torchId) ls.active = false;
    }
    args.addLightSource(
        new LightSource({
            id: torchId,
            x: args.lanternite.x,
            y: args.lanternite.y,
            lightAmount: LANTERNITE_TORCH_LIGHT,
            radius: LANTERNITE_TORCH_RADIUS_TILES,
            followUnitId: args.lanternite.id,
            decay: {
                roundCreated: 0,
                initialLightAmount: LANTERNITE_TORCH_LIGHT,
                initialRadius: LANTERNITE_TORCH_RADIUS_TILES,
                roundsTotal: 999,
            },
        }),
    );
}

export function upsertNestLightSource(args: {
    nest: Unit;
    addLightSource: (ls: LightSource) => void;
    lightSources: LightSource[];
}): void {
    const nestLightId = `lantern_nest_${args.nest.id}`;
    for (const ls of args.lightSources) {
        if (ls.id === nestLightId) ls.active = false;
    }
    args.addLightSource(
        new LightSource({
            id: nestLightId,
            x: args.nest.x,
            y: args.nest.y,
            lightAmount: LANTERNITE_NEST_LIGHT,
            radius: LANTERNITE_NEST_RADIUS_TILES,
            followUnitId: args.nest.id,
            decay: {
                roundCreated: 0,
                initialLightAmount: LANTERNITE_NEST_LIGHT,
                initialRadius: LANTERNITE_NEST_RADIUS_TILES,
                roundsTotal: 999,
            },
        }),
    );
}

/** One pulse at round_start or round_half milestones. */
export function processLanternitePulseMilestone(
    _milestone: 'round_start' | 'round_half',
    ctx: {
        units: Unit[];
        lightLevelEnabled: boolean;
        eventBus: EventBus;
        addLightSource: (ls: LightSource) => void;
        lightSources: LightSource[];
    },
): void {
    for (const lantern of ctx.units) {
        if (!lantern.isAlive() || lantern.characterId !== LANTERNITE_CHARACTER_ID) continue;
        applySoulSap(lantern, ctx.eventBus);
        if (!lantern.isAlive()) {
            removeLanterniteLightSources(lantern.id, ctx.lightSources);
            continue;
        }
        if (ctx.lightLevelEnabled) {
            upsertLanternLightSource({
                lanternite: lantern,
                addLightSource: ctx.addLightSource,
                lightSources: ctx.lightSources,
            });
        }
    }

    if (ctx.lightLevelEnabled) {
        for (const nest of ctx.units) {
            if (!nest.isAlive() || nest.characterId !== LANTERNITE_NEST_CHARACTER_ID) continue;
            upsertNestLightSource({
                nest,
                addLightSource: ctx.addLightSource,
                lightSources: ctx.lightSources,
            });
        }
    }
}

/** Initialise nest spawn pacing after the engine clock is ready. */
export function prepareLanterniteNestForMissionStart(unit: Unit, gameTime: number): void {
    if (unit.characterId !== LANTERNITE_NEST_CHARACTER_ID || !unit.lanterniteNestConfig) return;
    const iv = Math.max(0.5, unit.lanterniteNestConfig.spawnIntervalSec);
    unit.lanterniteNestSpawnState = {
        spawnedIds: [],
        nextSpawnAtGameTime: gameTime + iv,
    };
}

export function hydrateLanterniteNestFromMissionDef(unit: Unit, cfg: LanterniteNestMissionConfig): void {
    unit.lanterniteNestConfig = cfg;
    if (cfg.nestPoiId) unit.lanterniteHomeNestPoiId = cfg.nestPoiId;
}
