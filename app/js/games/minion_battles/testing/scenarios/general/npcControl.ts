/**
 * Player control of NPCs: ownership handoff + caster-relative faction targeting.
 * Controlled wolf (enemy team, player ownerId) scratches an adjacent team-player dummy.
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { UnitTag } from '../../../game/units/unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

/** Alpha Wolf Scratch — simplest damaging ability on the ENEMY_ALPHA_WOLF kit. */
const SCRATCH_ABILITY_ID = '0012';

const WOLF_ID = 'controlled_wolf';
const DUMMY_ID = 'player_team_dummy';

// Adjacent cells (40 px centre-to-centre); scratch hit range is ~70 px.
const WOLF_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 }; // (140, 140)
const DUMMY_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 }; // (180, 140)
// Hero parked away from the melee so it only exists to keep the runner non-idle.
const HERO_POS = { x: 1 * CELL + CELL / 2, y: 1 * CELL + CELL / 2 }; // (60, 60)

/**
 * NPC control: registerPlayerControl assigns the Boss-tagged wolf to the local player;
 * the wolf then scratches an adjacent team-`player` dummy (proves ownership + faction targeting).
 */
export const npcControlScenario: ScenarioDefinition = {
    id: 'npc_control_wolf_scratch',
    title: 'NPC control: player-owned wolf scratches a team-player dummy',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 8,
            gridH: 6,
            localPlayerId: P,
            grass: true,
        });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: HERO_POS.x,
            y: HERO_POS.y,
            abilities: [],
        });

        const dummy = createUnitFromSpawnConfig(
            {
                id: DUMMY_ID,
                characterId: 'enemy_melee',
                name: 'Player Dummy',
                hp: 500,
                x: DUMMY_POS.x,
                y: DUMMY_POS.y,
                teamId: 'player',
                ownerId: 'ai',
                unitAITreeId: 'static_test_no_ai',
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(dummy);
        engine.addUnit(dummy, 'initialGameSpawn');

        // Register before addUnit so the spawn hook assigns ownership.
        engine.registerPlayerControl(
            [{ unitTag: UnitTag.Boss, label: 'test' }],
            { boss: P },
        );

        const wolf = createUnitFromSpawnConfig(
            {
                id: WOLF_ID,
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: WOLF_POS.x,
                y: WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [SCRATCH_ABILITY_ID],
                unitTags: [UnitTag.Boss],
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');

        return engine;
    },

    getInitialOrders(engine) {
        const hero = engine.units.find(
            (u) => u.ownerId === P && u.teamId === 'player',
        )!;
        const wolf = engine.getUnit(WOLF_ID)!;
        const dummy = engine.getUnit(DUMMY_ID)!;
        return [
            { unitId: hero.id, abilityId: 'wait', targets: [] },
            {
                unitId: wolf.id,
                abilityId: SCRATCH_ABILITY_ID,
                targets: [{ type: 'unit', unitId: dummy.id }],
            },
        ];
    },

    assertPass(engine) {
        const wolf = engine.getUnit(WOLF_ID);
        const dummy = engine.getUnit(DUMMY_ID);
        return Boolean(
            wolf &&
                wolf.ownerId === P &&
                dummy &&
                dummy.hp < dummy.maxHp,
        );
    },

    failureMessage(engine) {
        const wolf = engine.getUnit(WOLF_ID);
        const dummy = engine.getUnit(DUMMY_ID);
        const active = wolf?.activeAbilities.map((a) => a.abilityId).join(',') ?? '—';
        return (
            `wolf ownerId=${wolf?.ownerId} (expected ${P}) ` +
            `dummy hp=${dummy?.hp}/${dummy?.maxHp} wolf active=[${active}]`
        );
    },
};
