import type { ScenarioDefinition } from '../../types';
import { asCardDefId } from '../../../card_defs';
import { EXPOSED_BUFF_TYPE } from '../../../buffs/ExposedBuff';
import { TRAINING_NODE_STRONG_PUNCH, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    seedHandWithAbilities,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { UnitTag } from '../../../game/units/unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import type { EnrageDef } from '../../../game/units/enrageDef';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
// Wolf is 50 px away — at punch max range (BASE_MAX_RANGE=30 + player radius=20).
const WOLF_POS = { x: PLAYER_POS.x + 50, y: PLAYER_POS.y };
// Second punch fires after the first ability cooldown (~96 ticks at 60 Hz).
const SECOND_PUNCH_TICK = 100;

/**
 * Alpha Wolf boss CC armor: one hit already absorbed before the scenario starts.
 * The player lands two Strong Punches in sequence:
 *   - Punch 1 (tick 0): consumed 1 → 2, absorbed (armor at threshold).
 *   - Punch 2 (tick 100): consumed 2 ≥ threshold → armor breaks → 5 s exposed.
 */
export const bossStunMechanicsScenario: ScenarioDefinition = {
    id: 'enemy_boss_stun_mechanics',
    title: 'Alpha Wolf boss: 2 Strong Punches break CC armor and expose for 5s',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 6000,
    buildEngine() {
        const research = { [P]: { [TRAINING_TREE_ID]: [TRAINING_NODE_STRONG_PUNCH] } };
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 6,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0102'],
            playerResearchTreesByPlayer: research,
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'alpha_wolf_boss',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: WOLF_POS.x,
                y: WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitTags: [UnitTag.Boss],
            },
            engine.eventBus,
        );
        // Alpha wolf has hardCcArmourFloor=2 (threshold=2) and ccArmourBreakStunDuration=5.
        // Pre-consume 1 hit so the two scenario punches fill and break the armor → exposed for 5 s.
        wolf.hardCcArmourConsumed = 1;
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf);

        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0102'), abilityId: '0102' }]);

        // Queue second punch after first cooldown; pendingOrders keeps battle non-idle until it fires.
        engine.state.orderMgr.queueOrder(SECOND_PUNCH_TICK, {
            unitId: player.id,
            abilityId: '0102',
            targets: [{ type: 'pixel', position: WOLF_POS }],
        });

        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0102', targets: [{ type: 'pixel', position: WOLF_POS }] }];
    },
    assertPass(engine) {
        return Boolean(engine.getUnit('alpha_wolf_boss')?.hasBuff(EXPOSED_BUFF_TYPE));
    },
    failureMessage(engine) {
        const wolf = engine.getUnit('alpha_wolf_boss');
        const exposed = wolf?.buffs.find((b) => b._type === EXPOSED_BUFF_TYPE);
        return `exposed=${wolf?.hasBuff(EXPOSED_BUFF_TYPE)} duration=${exposed?.duration.value ?? '—'} consumed=${wolf?.hardCcArmourConsumed} hp=${wolf?.hp}`;
    },
};

// Wolf at column 6, player 80 px to its left — well within the 120 px lunge range.
const TRIPLE_CHARGE_WOLF_POS = { x: 6 * 40 + 20, y: 3 * 40 + 20 };   // (260, 140)
const TRIPLE_CHARGE_PLAYER_POS = { x: TRIPLE_CHARGE_WOLF_POS.x - 80, y: TRIPLE_CHARGE_WOLF_POS.y };

/**
 * Enraged Alpha Wolf: Frenzied Charge (0011) executes 3 lunge dashes and hits the player.
 * Wolf has UnitTag.Enraged pre-applied; its order is queued in buildEngine so it fires
 * on the first engine tick. Player waits so the battle does not exit idle before the
 * first dash lands.
 */
export const alphaWolfTripleChargeScenario: ScenarioDefinition = {
    id: 'enemy_alpha_wolf_triple_charge',
    title: 'Enraged Alpha Wolf: Frenzied Charge hits player across 3 dashes',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 6000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: TRIPLE_CHARGE_PLAYER_POS.x,
            y: TRIPLE_CHARGE_PLAYER_POS.y,
            abilities: [],
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'alpha_wolf_enraged',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: TRIPLE_CHARGE_WOLF_POS.x,
                y: TRIPLE_CHARGE_WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0011'],
                unitTags: [UnitTag.Boss, UnitTag.Enraged],
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf);

        engine.state.orderMgr.queueOrder(1, {
            unitId: wolf.id,
            abilityId: '0011',
            targets: [{ type: 'unit', unitId: player.id }],
        });

        return engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        return Boolean(player && player.hp < player.maxHp);
    },
    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const wolf = engine.getUnit('alpha_wolf_enraged');
        const active = wolf?.activeAbilities.map((a) => a.abilityId).join(',') ?? '—';
        return `player hp=${player?.hp}/${player?.maxHp} wolf activeAbilities=[${active}]`;
    },
};

// Wolf just above 50 % HP so one base punch (15 dmg) tips it into the enrage threshold.
const ENRAGE_WOLF_POS = { x: 5 * 40 + 20, y: 2 * 40 + 20 };   // (220, 100)
// Player 45 px to the left — inside punch range (BASE_MAX_RANGE=30 + player radius=20 = 50 px).
const ENRAGE_PLAYER_POS = { x: ENRAGE_WOLF_POS.x - 45, y: ENRAGE_WOLF_POS.y };

const WOLF_ENRAGE_DEF: EnrageDef = {
    conditionType: 'health_below_percent',
    threshold: 0.5,
    tag: UnitTag.Enraged,
    oneShot: true,
};

/**
 * Alpha Wolf enrage trigger: wolf starts just above 50 % HP; one player punch
 * drops it below the threshold, which should apply UnitTag.Enraged via UnitManager.
 */
export const alphaWolfEnrageTriggersScenario: ScenarioDefinition = {
    id: 'enemy_alpha_wolf_enrage_triggers',
    title: 'Alpha Wolf: UnitTag.Enraged is applied when HP drops below 50%',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 4000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 6, localPlayerId: P, grass: true });

        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: ENRAGE_PLAYER_POS.x,
            y: ENRAGE_PLAYER_POS.y,
            abilities: ['0102'],
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'alpha_wolf_pre_enrage',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: ENRAGE_WOLF_POS.x,
                y: ENRAGE_WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitTags: [UnitTag.Boss],
                enrageDef: WOLF_ENRAGE_DEF,
            },
            engine.eventBus,
        );
        // One tick above 50 % so a single base punch (8 dmg) crosses the threshold.
        wolf.hp = Math.floor(wolf.maxHp * 0.5) + 1;
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf);

        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0102'), abilityId: '0102' }]);

        return engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: '0102', targets: [{ type: 'pixel', position: ENRAGE_WOLF_POS }] }];
    },
    assertPass(engine) {
        const wolf = engine.getUnit('alpha_wolf_pre_enrage');
        return Boolean(wolf?.tags.includes(UnitTag.Enraged));
    },
    failureMessage(engine) {
        const wolf = engine.getUnit('alpha_wolf_pre_enrage');
        return `wolf tags=${JSON.stringify(wolf?.tags)} hp=${wolf?.hp}/${wolf?.maxHp}`;
    },
};

// Alpha wolf at (240, 160); player 40 px to its left at (200, 160).
// Wolves spawn at (+35, 0) and (-24.5, +24.5) relative to the alpha wolf —
// both well within DarkWolfBite's 100 px base range.
const SUMMON_CELL = 40;
const SUMMON_PLAYER_POS = { x: 5 * SUMMON_CELL, y: 4 * SUMMON_CELL };
const SUMMON_ALPHA_POS  = { x: 6 * SUMMON_CELL, y: 4 * SUMMON_CELL };
// Second player wait fires at tick 90 (= 1.5 s), just as the first wait
// expires, to prevent the engine from pausing for player input before the
// wolf bites land (~tick 101).
const SUMMON_SECOND_WAIT_TICK = 90;

/**
 * Alpha Wolf Summon: the alpha wolf casts Summon (0005), spawning 2 dark wolves
 * that immediately queue a DarkWolfBite against the player. The player should
 * receive damage from at least one bite before the scenario ends.
 */
export const alphaWolfSummonScenario: ScenarioDefinition = {
    id: 'enemy_alpha_wolf_summon',
    title: 'Alpha Wolf Summon: spawned wolves immediately attack and damage the player',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 4000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: SUMMON_PLAYER_POS.x,
            y: SUMMON_PLAYER_POS.y,
            abilities: [],
        });

        const alphaWolf = createUnitFromSpawnConfig(
            {
                id: 'summon_test_alpha_wolf',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: SUMMON_ALPHA_POS.x,
                y: SUMMON_ALPHA_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0005'],
                unitTags: [UnitTag.Boss],
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(alphaWolf);
        engine.addUnit(alphaWolf);

        // Alpha wolf casts Summon on tick 1.
        engine.state.orderMgr.queueOrder(1, {
            unitId: alphaWolf.id,
            abilityId: '0005',
            targets: [],
        });

        // Prevent the engine from pausing for player input while waiting for
        // wolf bites to land. The first wait expires at t=1.5 s (tick 90);
        // queuing a second wait at that same tick re-extends the lockout.
        engine.state.orderMgr.queueOrder(SUMMON_SECOND_WAIT_TICK, {
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
        });

        return engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        return Boolean(player && player.hp < player.maxHp);
    },
    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        const wolfInfo = wolves.map((w) => `id=${w.id} hp=${w.hp} active=${w.activeAbilities.map((a) => a.abilityId).join(',')}`).join(' | ');
        return `player hp=${player?.hp}/${player?.maxHp} wolves=[${wolfInfo}]`;
    },
};
