/**
 * Hunger E2E scenario — hunger_fight_start_max_hp_tiers.
 *
 * Three player units are spawned and run through the same `applyFightStartHunger` step
 * `BaseMissionDef` uses at fight start: one well fed (>= 15%), one hungry (< 15%) and one
 * starving (0). Hungry starts at 75% max HP, starving at 50%, well fed unchanged.
 */

import type { ScenarioDefinition } from '../../types';
import { buildTinyBattleEngine, spawnTinyPlayerUnit } from '../../harness/buildTinyBattleEngine';
import { applyFightStartHunger } from '../../../character_defs/hungerHealth';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';

const CELL = 40;
const MAX_HUNGER = 100;
const FED_ID = 'hunger_fed';
const HUNGRY_ID = 'hunger_hungry';
const STARVING_ID = 'hunger_starving';

const SETUP: { id: string; col: number; hunger: number }[] = [
    { id: FED_ID, col: 1, hunger: 15 }, // exactly 15%: no penalty
    { id: HUNGRY_ID, col: 3, hunger: 14 },
    { id: STARVING_ID, col: 5, hunger: 0 },
];

function unitFor(engine: GameEngine, id: string): Unit | undefined {
    return engine.getUnits().find((u) => u.id === id || u.ownerId === id);
}

export const hungerFightStartMaxHpTiersScenario: ScenarioDefinition = {
    id: 'hunger_fight_start_max_hp_tiers',
    title: 'Hunger: low Hunger lowers starting max HP (-25% under 15%, -50% at 0)',
    category: 'general',
    generalSection: 'Hunger',
    maxDurationMs: 2000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 4, localPlayerId: FED_ID });
        for (const s of SETUP) {
            const unit = spawnTinyPlayerUnit(engine, {
                playerId: s.id,
                x: s.col * CELL + CELL / 2,
                y: 1 * CELL + CELL / 2,
                abilities: [],
            });
            applyFightStartHunger(unit, s.hunger, MAX_HUNGER);
        }
        return engine;
    },

    getInitialOrders() {
        return [{ unitId: FED_ID, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const fed = unitFor(engine, FED_ID);
        const hungry = unitFor(engine, HUNGRY_ID);
        const starving = unitFor(engine, STARVING_ID);
        if (!fed || !hungry || !starving) return false;
        const full = fed.maxHp;
        return (
            fed.hungerPenalty === 0 &&
            fed.hp === full &&
            hungry.hungerPenalty === 0.25 &&
            hungry.maxHp === Math.round(full * 0.75) &&
            hungry.hp === hungry.maxHp &&
            starving.hungerPenalty === 0.5 &&
            starving.maxHp === Math.round(full * 0.5) &&
            starving.hp === starving.maxHp
        );
    },

    failureMessage(engine) {
        return [FED_ID, HUNGRY_ID, STARVING_ID]
            .map((id) => {
                const u = unitFor(engine, id);
                return u ? `${id}: hp ${u.hp}/${u.maxHp} penalty ${u.hungerPenalty}` : `${id}: missing`;
            })
            .join('; ');
    },
};

export const HUNGER_SCENARIOS: ScenarioDefinition[] = [hungerFightStartMaxHpTiersScenario];
