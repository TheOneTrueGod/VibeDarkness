/**
 * Lanternite — two light pulses per round (round start + midpoint), Soul Sap, torch follows the creature.
 */

import type { Unit } from '../units/Unit';
import { Effect } from '../effects/Effect';
import type { EventBus } from '../EventBus';
import type { LanterniteNestMissionConfig } from '../../storylines/types';

export const LANTERNITE_CHARACTER_ID = 'lanternite';
export const LANTERNITE_NEST_CHARACTER_ID = 'lanternite_nest';
export const LANTERNITE_SOUL_SAP_MAX_HP_FRACTION = 0.07;
export const LANTERNITE_RESPAWN_DELAY_SEC = 3;
export const LANTERNITE_TORCH_LIGHT = 12;
export const LANTERNITE_TORCH_RADIUS_TILES = 4.5;

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
export function removeLanterniteTorchEffects(ownerLanternUnitId: string, effects: Effect[]): void {
    for (const e of effects) {
        if (!e.active || e.effectType !== 'Torch') continue;
        const data = e.effectData as { lanternOwnerUnitId?: string };
        if (data.lanternOwnerUnitId === ownerLanternUnitId) e.active = false;
    }
}

function upsertLanternTorch(args: {
    lanternite: Unit;
    addEffect: (e: Effect) => void;
    effects: Effect[];
}): void {
    const torchId = `lantern_torch_${args.lanternite.id}`;
    for (const e of args.effects) {
        if (e.id === torchId) e.active = false;
    }
    args.addEffect(
        new Effect({
            id: torchId,
            x: args.lanternite.x,
            y: args.lanternite.y,
            duration: 999_999,
            effectType: 'Torch',
            effectData: {
                lightAmount: LANTERNITE_TORCH_LIGHT,
                radius: LANTERNITE_TORCH_RADIUS_TILES,
                followUnitId: args.lanternite.id,
                lanternOwnerUnitId: args.lanternite.id,
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
        addEffect: (e: Effect) => void;
        effects: Effect[];
    },
): void {
    for (const lantern of ctx.units) {
        if (!lantern.isAlive() || lantern.characterId !== LANTERNITE_CHARACTER_ID) continue;
        applySoulSap(lantern, ctx.eventBus);
        if (!lantern.isAlive()) {
            removeLanterniteTorchEffects(lantern.id, ctx.effects);
            continue;
        }
        if (ctx.lightLevelEnabled) {
            upsertLanternTorch({
                lanternite: lantern,
                addEffect: ctx.addEffect,
                effects: ctx.effects,
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
}
