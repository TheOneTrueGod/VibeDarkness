import type { ScenarioDefinition } from '../../types';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../../../buffs/ExposedBuff';
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
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
// Wolf is 50 px away â€” at punch max range (BASE_MAX_RANGE=30 + player radius=20).
const WOLF_POS = { x: PLAYER_POS.x + 50, y: PLAYER_POS.y };
// Second punch fires after the first ability cooldown (~96 ticks at 60 Hz).
const SECOND_PUNCH_TICK = 100;

/**
 * Alpha Wolf boss CC armor: one hit already absorbed before the scenario starts.
 * The player lands two Strong Punches in sequence:
 *   - Punch 1 (tick 0): consumed 1 â†’ 2, absorbed (armor at threshold).
 *   - Punch 2 (tick 100): consumed 2 â‰¥ threshold â†’ armor breaks â†’ 5 s exposed.
 */
export const bossStunMechanicsScenario: ScenarioDefinition = {
    id: 'enemy_boss_stun_mechanics',
    title: 'Alpha Wolf boss: 2 Strong Punches break CC armor and expose for 5s',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 6000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 6,
            localPlayerId: P,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0117'],
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
        // Pre-consume 1 hit so the two scenario punches fill and break the armor â†’ exposed for 5 s.
        wolf.hardCcArmourConsumed = 1;
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');


        // Queue second punch after first cooldown; pendingOrders keeps battle non-idle until it fires.
        engine.state.orderMgr.queueOrder(SECOND_PUNCH_TICK, {
            unitId: player.id,
            abilityId: '0117',
            targets: [{ type: 'pixel', position: WOLF_POS }],
        });

        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0117', targets: [{ type: 'pixel', position: WOLF_POS }] }];
    },
    assertPass(engine) {
        return Boolean(engine.getUnit('alpha_wolf_boss')?.hasBuff(EXPOSED_BUFF_TYPE));
    },
    failureMessage(engine) {
        const wolf = engine.getUnit('alpha_wolf_boss');
        const exposed = wolf?.buffs.find((b) => b._type === EXPOSED_BUFF_TYPE);
        return `exposed=${wolf?.hasBuff(EXPOSED_BUFF_TYPE)} duration=${exposed?.duration.value ?? 'â€”'} consumed=${wolf?.hardCcArmourConsumed} hp=${wolf?.hp}`;
    },
};

// Wolf at column 6, player 80 px to its left â€” well within the 120 px lunge range.
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
        engine.addUnit(wolf, 'initialGameSpawn');

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
        const active = wolf?.activeAbilities.map((a) => a.abilityId).join(',') ?? 'â€”';
        return `player hp=${player?.hp}/${player?.maxHp} wolf activeAbilities=[${active}]`;
    },
};

// Wolf just above 50 % HP so one base punch (15 dmg) tips it into the enrage threshold.
const ENRAGE_WOLF_POS = { x: 5 * 40 + 20, y: 2 * 40 + 20 };   // (220, 100)
// Player 45 px to the left â€” inside punch range (BASE_MAX_RANGE=30 + player radius=20 = 50 px).
const ENRAGE_PLAYER_POS = { x: ENRAGE_WOLF_POS.x - 45, y: ENRAGE_WOLF_POS.y };

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
            abilities: ['0120'],
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
            },
            engine.eventBus,
        );
        // One tick above 50 % so a single base punch (8 dmg) crosses the threshold.
        wolf.hp = Math.floor(wolf.maxHp * 0.5) + 1;
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');


        return engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: '0120', targets: [{ type: 'pixel', position: ENRAGE_WOLF_POS }] }];
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
// Wolves spawn at (+35, 0) and (-24.5, +24.5) relative to the alpha wolf â€”
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
        engine.addUnit(alphaWolf, 'initialGameSpawn');

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

// â”€â”€â”€ Exposed duration extension â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const P1 = TINY_BATTLE_PLAYER_ID; // 'tiny_p1'
const P2 = 'tiny_p2';

const EXT_WOLF_POS = { x: 5 * CELL + 20, y: 3 * CELL + 20 }; // (220, 140)
const EXT_P1_POS   = { x: EXT_WOLF_POS.x - 50, y: EXT_WOLF_POS.y }; // within StrongPunch + SwingBat range
const EXT_P2_POS   = { x: EXT_WOLF_POS.x + 50, y: EXT_WOLF_POS.y }; // within StrongPunch range

const EXT_EXPOSED_DURATION = 3; // seconds
const EXT_P2_PUNCH_TICK    = 60;  // ~1 s
const EXT_P1_BAT_TICK      = 120; // ~2 s

/**
 * Exposed duration extension test.
 *
 * The alpha wolf starts in the Exposed state (3 s).  Without any extension it
 * would expire exactly at t=3 s.  Two players land Strong Punches during the
 * window; each absorbed stun extends the remaining duration.  After 3 s the
 * wolf must still carry the Exposed buff.
 *
 * Sequence:
 *   t=0   P1 casts StrongPunch â†’ stun absorbed â†’ extends ~+elapsed_at_impact s
 *   tâ‰ˆ1 s P2 casts StrongPunch â†’ stun absorbed â†’ may extend further
 *   tâ‰ˆ2 s P1 casts SwingBat   â†’ knockback launches wolf (applied, not absorbed)
 *   tâ‰¥3 s assertPass: hasBuff('exposed') must be true
 */
export const exposedDurationExtensionScenario: ScenarioDefinition = {
    id: 'exposed_duration_extension',
    title: 'Exposed boss: absorbed stuns extend the exposed window (duration.value exceeds base)',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: P1,
            grass: true,
        });

        const p1 = spawnTinyPlayerUnit(engine, {
            playerId: P1,
            x: EXT_P1_POS.x,
            y: EXT_P1_POS.y,
            abilities: ['0117', '0115'],
        });

        const p2 = spawnTinyPlayerUnit(engine, {
            playerId: P2,
            x: EXT_P2_POS.x,
            y: EXT_P2_POS.y,
            abilities: ['0117'],
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'alpha_wolf_exposed_ext',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: EXT_WOLF_POS.x,
                y: EXT_WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitTags: [UnitTag.Boss],
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');
        wolf.addBuff(new ExposedBuff(EXT_EXPOSED_DURATION), 0, 1);

        engine.state.orderMgr.queueOrder(EXT_P2_PUNCH_TICK, {
            unitId: p2.id,
            abilityId: '0117',
            targets: [{ type: 'pixel', position: EXT_WOLF_POS }],
        });
        engine.state.orderMgr.queueOrder(EXT_P1_BAT_TICK, {
            unitId: p1.id,
            abilityId: '0115',
            targets: [{ type: 'pixel', position: EXT_WOLF_POS }],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const p1 = engine.getLocalPlayerUnit()!;
        return [{ unitId: p1.id, abilityId: '0117', targets: [{ type: 'pixel', position: EXT_WOLF_POS }] }];
    },

    assertPass(engine) {
        const wolf = engine.getUnit('alpha_wolf_exposed_ext');
        const buff = wolf?.buffs.find(b => b._type === EXPOSED_BUFF_TYPE) as ExposedBuff | undefined;
        // Verify at least one absorbed CC extended the duration beyond the base.
        return Boolean(buff && buff.duration.value > EXT_EXPOSED_DURATION);
    },

    failureMessage(engine) {
        const wolf = engine.getUnit('alpha_wolf_exposed_ext');
        const buff = wolf?.buffs.find(b => b._type === EXPOSED_BUFF_TYPE) as ExposedBuff | undefined;
        return `t=${engine.gameTime.toFixed(2)} duration=${buff?.duration.value.toFixed(2) ?? 'â€”'} base=${EXT_EXPOSED_DURATION} resistance=${buff?.exposedResistance.toFixed(2) ?? 'none'} â€” expected buff.duration.value > ${EXT_EXPOSED_DURATION}`;
    },
};

// ─── Alpha Wolf Scratch ─────────────────────────────────────────────────────

// Player at col 2 (x=100); wolf starts at col 5 (x=220) — 120 px away, outside scratch range (~70 px).
// Hunt AI drives the wolf: no LOS required, approaches and attacks relentlessly.
// Unit aiSettings maxRange matches scratch's AI range (70 px) so movement stops when attack is ready.
const SCRATCH_PLAYER_POS = { x: 2 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };  // (100, 180)
const SCRATCH_WOLF_START = { x: 5 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };  // (220, 180)

/**
 * Alpha Wolf Scratch: wolf spawns outside scratch range, hunts the player down via the hunt AI tree,
 * then fires Scratch (0012) once in range. Verifies autonomous approach + melee damage.
 */
export const alphaWolfScratchScenario: ScenarioDefinition = {
    id: 'enemy_alpha_wolf_scratch',
    title: 'Alpha Wolf Scratch: wolf closes from out of range and damages the player',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 4000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: SCRATCH_PLAYER_POS.x,
            y: SCRATCH_PLAYER_POS.y,
            abilities: [],
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'alpha_wolf_scratch_test',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: SCRATCH_WOLF_START.x,
                y: SCRATCH_WOLF_START.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0012'],
                unitTags: [UnitTag.Boss],
                unitAITreeId: 'hunt',
                // Range matches scratch's aiSettings so movement halts when the attack becomes available.
                aiSettings: { minRange: 0, maxRange: 70 },
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');

        // Keep player non-idle so the battle does not exit early (wait ≈ 1.5 s = 90 ticks each).
        for (const tick of [90, 180]) {
            engine.state.orderMgr.queueOrder(tick, {
                unitId: player.id,
                abilityId: 'wait',
                targets: [],
            });
        }

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
        const wolf = engine.getUnit('alpha_wolf_scratch_test');
        const wolfActive = wolf?.activeAbilities.map(a => a.abilityId).join(',') ?? '—';
        const dist = player && wolf
            ? Math.hypot(wolf.x - player.x, wolf.y - player.y).toFixed(0)
            : '—';
        return `player hp=${player?.hp}/${player?.maxHp} wolf pos=(${wolf?.x.toFixed(0)},${wolf?.y.toFixed(0)}) dist=${dist} wolf active=[${wolfActive}]`;
    },
};

// ─── Enemy Archer Shot ──────────────────────────────────────────────────────

// Archer at (300, 160); player 120 px to its left at (180, 160).
// 120 px is well within MAX_DISTANCE (280) and outside melee range.
const ARCHER_POS  = { x: 7 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };  // (300, 180)
const ARCHER_PLAYER_POS = { x: ARCHER_POS.x - 120, y: ARCHER_POS.y };     // (180, 180)

/**
 * Enemy Archer Shot: an enemy_ranged unit with ability 0001 queues a shot toward the
 * player dummy. The projectile should travel across the gap and damage the player.
 */
export const enemyArcherShotScenario: ScenarioDefinition = {
    id: 'enemy_archer_shot',
    title: 'Enemy Archer Shot: projectile travels and damages the player',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 8, localPlayerId: P, grass: true });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: ARCHER_PLAYER_POS.x,
            y: ARCHER_PLAYER_POS.y,
            abilities: [],
        });

        const archer = createUnitFromSpawnConfig(
            {
                id: 'enemy_archer_test',
                characterId: 'enemy_ranged',
                name: 'Archer',
                x: ARCHER_POS.x,
                y: ARCHER_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0001'],
                aiSettings: { minRange: 0, maxRange: 280 },
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(archer);
        engine.addUnit(archer, 'initialGameSpawn');

        // Queue the archer shot on tick 1 toward the player position.
        engine.state.orderMgr.queueOrder(1, {
            unitId: archer.id,
            abilityId: '0001',
            targets: [{ type: 'pixel', position: ARCHER_PLAYER_POS }],
        });

        // Keep player non-idle while the projectile travels.
        engine.state.orderMgr.queueOrder(90, {
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
        const archer = engine.getUnit('enemy_archer_test');
        const archerActive = archer?.activeAbilities.map(a => a.abilityId).join(',') ?? '—';
        return `player hp=${player?.hp}/${player?.maxHp} archer active=[${archerActive}]`;
    },
};
