/**
 * Pet system ability-test scenarios.
 * Covers the spirit animal: guarding (anchored on the owner, never auto-engaging), Sic 'em / Pounce
 * (0704/0702) locking on into Spirit Flurry (0711), and cast priority (`game/units/castPriority.ts`):
 * a commanded (Major) cast replacing a bite, and a spirit held by Spirit Storm refusing a command.
 * Displacement Strike (0715 → 0716): clones hunt then fade, and a clone past its time finishes its cast.
 */

import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { ResolvedTarget } from '../../../game/types';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import type { StunnedBuff } from '../../../buffs/StunnedBuff';
import { petStateOf } from '../../../game/units/components/petComponent';
import { getPetDef } from '../../../game/units/pet_defs/petDef';
import {
    SPIRIT_FLURRY_ABILITY_ID,
    SPIRIT_FLURRY_ANGLES,
} from '../../../card_defs/07_command_core/0711_SpiritFlurry/0711Ability';
import { SPIRIT_STRIKE_DAMAGE } from '../../../card_defs/07_command_core/0710_SpiritStrike/0710Ability';
import { FLING_THORN_ABILITY_ID } from '../../../card_defs/07_command_core/0705_FlingThorn/0705Ability';
import {
    FLING_THORN_AIM_LABEL,
    FLING_THORN_COMMAND_ID,
} from '../../../card_defs/07_command_core/0714_FlingThornCommand/0714Ability';
import {
    SPIRIT_STORM_ABILITY_ID,
    SPIRIT_STORM_REPOSITION_LABEL,
} from '../../../card_defs/07_command_core/0713_SpiritStorm/0713Ability';
import { CAST_PRIORITY } from '../../../game/units/castPriority';
import { DISPLACEMENT_STRIKE_AIM_LABEL } from '../../../card_defs/07_command_core/0715_DisplacementStrike/0715Ability';
import {
    DISPLACEMENT_STRIKE_CARD_ID,
    DISPLACEMENT_STRIKE_CLONE_COUNT,
    DISPLACEMENT_STRIKE_CLONE_SECONDS,
    DISPLACEMENT_STRIKE_PET_ABILITY_ID,
} from '../../../card_defs/07_command_core/0716_DisplacementStrikePet/0716Constants';
import { spawnPetForOwner } from '../../../game/units/petSpawn';
import { getLivingPetsOfUnit } from '../../../game/units/petHelpers';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import type { Unit } from '../../../game/units/Unit';
import {
    GUARD_ABILITY_ID,
    GUARD_SECONDS,
    GUARD_SHIELD_FLOOR,
    GUARD_TARGET_LABEL,
} from '../../../card_defs/07_command_core/0712_Guard/0712Ability';

/** Pounce only stuns: all of Sic 'em's damage comes from the Spirit Flurry strikes. */
const POUNCE_HIT_DAMAGE = 0;

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;

// Helper: spawn a dog linked to an owner.
function spawnDog(
    engine: ReturnType<typeof buildTinyBattleEngine>,
    owner: ReturnType<typeof spawnTinyPlayerUnit>,
    pos: { x: number; y: number },
    opts: { hp?: number; extraAbilities?: string[] } = {},
): ReturnType<typeof createUnitFromSpawnConfig> {
    const dog = createUnitFromSpawnConfig(
        {
            id: 'dog1',
            characterId: 'dog',
            name: 'Dog',
            x: pos.x,
            y: pos.y,
            teamId: 'player',
            ownerId: 'ai',
            abilities: [...getPetDef('dog')!.abilityIds, ...(opts.extraAbilities ?? [])],
            unitAITreeId: 'pet',
            aiSettings: { minRange: 0, maxRange: 50 },
        },
        engine.eventBus,
        engine,
    );
    petStateOf(dog).defId = 'dog';
    petStateOf(dog).ownerUnitId = owner.id;
    if (opts.hp !== undefined) dog.hp = opts.hp;
    petStateOf(owner).unitIds.push(dog.id);
    initializeAbilityRuntimeForUnit(dog);
    engine.addUnit(dog, 'initialGameSpawn');
    return dog;
}

function pixel(position: { x: number; y: number }): ResolvedTarget {
    return { type: 'pixel', position: { x: position.x, y: position.y } };
}

/** A stationary target dummy (no AI, so a pre-aimed order still points at it). */
function spawnStaticDummy(engine: GameEngine, id: string, pos: { x: number; y: number }): void {
    const enemy = createTargetDummyAtWorld(engine, pos.x, pos.y, { id, hp: 100 });
    initializeAbilityRuntimeForUnit(enemy);
    engine.addUnit(enemy, 'initialGameSpawn');
}

// ---- Scenario 1: Spirit guards its owner ----

/**
 * The spirit starts the mission guarding (no ordered point), so its anchor is the owner. An enemy stands
 * close by: the spirit engages and bites it. The player then walks far east; the spirit breaks off (return
 * leash) and follows, ending within its anchor radius (50 px, plus a little slack for the last step).
 *
 * Assertions:
 *   1. The enemy took damage (guarding engages enemies near the owner).
 *   2. The spirit ended within 60 px of the player.
 */
export const petAutoEngageScenario: ScenarioDefinition = {
    id: 'pet_auto_engage',
    title: 'Spirit: guards its owner — attacks nearby enemies, then follows within 50 px',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 25000,

    buildEngine() {
        // Wide grid so the player can walk far enough to trigger the return leash (300 px).
        const engine = buildTinyBattleEngine({ gridW: 22, gridH: 12, localPlayerId: P, grass: true });

        const tm = engine.terrainManager!;
        // Player at cell (3, 5) — left-ish, room to walk right.
        const playerPos = tm.grid.gridToWorld(3, 5);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: playerPos.x,
            y: playerPos.y,
            abilities: [],
        });

        // Dog one cell east of player.
        const dogPos = tm.grid.gridToWorld(4, 5);
        spawnDog(engine, player, dogPos);

        // Enemy three cells east of player — 120 px away, inside engage leash (150 px).
        const enemyPos = tm.grid.gridToWorld(6, 5);
        const enemy = createUnitFromSpawnConfig(
            {
                id: 'enemy1',
                characterId: 'target_dummy',
                name: 'Target',
                x: enemyPos.x,
                y: enemyPos.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'default',
                aiSettings: { minRange: 0, maxRange: 30 },
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        // Pre-queue wait orders for the player after the move arrives, to prevent idle early-exit.
        const unitId = player.id;
        for (const tick of [480, 600, 720, 840, 960, 1080, 1200, 1320]) {
            engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const player = engine.getLocalPlayerUnit()!;
        // Walk east to cell 19 — ~640 px from player start, putting player 440+ px from the enemy.
        // When player arrives, dog (at enemy ~col 6) is 520+ px away → return leash (300 px) fires.
        const from = tm.grid.worldToGrid(player.x, player.y);
        const path = tm.findGridPath(from.col, from.row, 19, from.row);
        if (!path || path.length === 0) return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
        return [{ unitId: player.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },

    assertPass(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        const player = engine.getLocalPlayerUnit()!;
        if (!enemy || !dog) return false;
        const bitten = enemy.hp < enemy.maxHp;
        const dogNearOwner = Math.hypot(dog.x - player.x, dog.y - player.y) <= 60;
        return bitten && dogNearOwner;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        const player = engine.getLocalPlayerUnit()!;
        const dist = dog ? Math.hypot(dog.x - player.x, dog.y - player.y).toFixed(0) : '?';
        return (
            `enemy dmg=${enemy ? enemy.maxHp - enemy.hp : '?'} ` +
            `dog-to-owner=${dist} px ` +
            `dog pos=(${dog?.x.toFixed(0)},${dog?.y.toFixed(0)}) ` +
            `player pos=(${player.x.toFixed(0)},${player.y.toFixed(0)})`
        );
    },
};

// ---- Scenario 2: Sic 'em / Pounce ----

/**
 * Player casts Sic 'em (0704) at a point beyond an enemy in the dog's southward dash lane.
 * The dog pounces via Pounce (0702), stops on the enemy (stopOnHit), deals ~3 damage,
 * stuns the enemy, and displaces it opposite the dash direction (northward).
 *
 * This scenario also covers Pounce (0702) — the pet command ability used by Sic 'em.
 */
export const petSicEmPounceScenario: ScenarioDefinition = {
    id: 'pet_sic_em_pounce',
    title: "Sic 'em (0704) + Pounce (0702): spirit lunges, locks on to the first enemy, then strikes it four times",
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 14, localPlayerId: P, grass: true });

        const PLAYER_POS = { x: 5 * CELL, y: 5 * CELL };

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0704'], // Sic 'em
        });

        // Dog starts 50 px south of player.
        const DOG_POS = { x: PLAYER_POS.x, y: PLAYER_POS.y + 50 };
        spawnDog(engine, player, DOG_POS);

        // Enemy 130 px south of dog — within Pounce max range (120 px), directly in the dash lane.
        const ENEMY_POS = { x: DOG_POS.x, y: DOG_POS.y + 130 };
        const enemy = createUnitFromSpawnConfig(
            {
                id: 'enemy1',
                characterId: 'target_dummy',
                name: 'Target',
                x: ENEMY_POS.x,
                y: ENEMY_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitAITreeId: 'default',
                aiSettings: { minRange: 0, maxRange: 30 },
            },
            engine.eventBus,
            engine,
        );
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        // Keep player non-idle so the simulation does not early-exit while the dog is mid-dash.
        const unitId = player.id;
        for (const tick of [60, 180, 300, 420, 540, 660, 780]) {
            engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
        }

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const dog = engine.getUnit('dog1')!;
        // Target point: 200 px south of dog — beyond the enemy (at +130); dash clamped to Pounce max (120 px).
        const targetY = dog.y + 200;
        return [{
            unitId: player.id,
            abilityId: '0704', // Sic 'em
            targets: [{ type: 'pixel' as const, position: { x: dog.x, y: targetY } }],
        }];
    },

    assertPass(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        if (!enemy || !dog) return false;

        // Pounce's hit, then the lock-on: four Spirit Flurry strikes on the same enemy.
        const expected = POUNCE_HIT_DAMAGE + SPIRIT_FLURRY_ANGLES.length * SPIRIT_STRIKE_DAMAGE;
        return enemy.maxHp - enemy.hp >= expected;
    },

    failureMessage(engine) {
        const enemy = engine.getUnit('enemy1');
        const dog = engine.getUnit('dog1');
        const ENEMY_ORIGINAL_Y = 5 * CELL + 50 + 130;
        const stun = enemy?.buffs.find((b) => b._type === 'stun') as StunnedBuff | undefined;
        return (
            `enemy hp=${enemy?.hp}/${enemy?.maxHp} ` +
            `enemy y=${enemy?.y.toFixed(0)} (orig=${ENEMY_ORIGINAL_Y}) ` +
            `stun=${stun ? stun.duration.value.toFixed(2) : 'none'} ` +
            `dog y=${dog?.y.toFixed(0)} (stop≤${ENEMY_ORIGINAL_Y + 30})`
        );
    },
};

// ---- Cast priority tracking ----

/** What the cast-priority scenarios saw on the event bus (one tracker per engine, so reruns start clean). */
interface PetPriorityTracker {
    /** Ability ids the spirit started casting, in order. */
    dogCasts: string[];
    /** Ability ids of the spirit's casts that a higher-priority order preempted. */
    dogPreempted: string[];
    /** Fling Thorns hits on any unit. */
    thornHits: number;
    /** A Fling Thorns projectile existed at some tick. */
    sawThornProjectile: boolean;
    /** The player started Spirit Storm. */
    stormStarted: boolean;
    /** Spirit position closest to the storm point while the player's Spirit Storm was running. */
    dogPosDuringStorm: { x: number; y: number } | null;
}

const priorityTrackers = new WeakMap<GameEngine, PetPriorityTracker>();

function trackPetPriority(engine: GameEngine): PetPriorityTracker {
    const t: PetPriorityTracker = {
        dogCasts: [],
        dogPreempted: [],
        thornHits: 0,
        sawThornProjectile: false,
        stormStarted: false,
        dogPosDuringStorm: null,
    };
    engine.eventBus.on('ability_used', (e) => {
        if (e.unitId === 'dog1') t.dogCasts.push(e.abilityId);
        if (e.abilityId === SPIRIT_STORM_ABILITY_ID) t.stormStarted = true;
    });
    engine.eventBus.on('cast_ended_early', (e) => {
        if (e.unitId === 'dog1' && e.reason === 'preempted') t.dogPreempted.push(e.abilityId);
    });
    engine.eventBus.on('attack_hit', (e) => {
        if (e.abilityId === FLING_THORN_ABILITY_ID) t.thornHits++;
    });
    priorityTrackers.set(engine, t);
    return t;
}

function trackerOf(engine: GameEngine): PetPriorityTracker {
    return priorityTrackers.get(engine) ?? trackPetPriority(engine);
}

/** Dog Bite's damage (0701), unmodified (no Empower Pet research here). */
const DOG_BITE_DAMAGE = 5;
const DOG_BITE_ABILITY_ID = getPetDef('dog')!.basicAttackAbilityId;

// ---- Scenario 3: a command preempts a bite ----

/** Tick the player plays Fling Thorns: the spirit is in its first bite's windup (0.6 s) by then. */
const PREEMPT_COMMAND_TICK = 20;

/**
 * The spirit is guarding and bites a stationary dummy next to it. Mid-bite, the player plays Fling Thorns (0714) at the
 * dummy. The command is Major and the bite is Minor, so the bite is preempted (no refund) and the thorns fly.
 *
 * Assertions:
 *   1. A spirit bite was preempted.
 *   2. At least one thorn hit the dummy.
 *   3. The dummy took more damage than the bites the spirit started could deal on their own.
 */
export const petCommandPreemptsBiteScenario: ScenarioDefinition = {
    id: 'pet_command_preempts_bite',
    title: 'Cast priority: commanding Fling Thorns mid-bite replaces the bite and the thorns land',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 9, localPlayerId: P, grass: true });
        trackPetPriority(engine);
        const tm = engine.terrainManager!;

        const playerPos = tm.grid.gridToWorld(2, 4);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: playerPos.x,
            y: playerPos.y,
            abilities: [FLING_THORN_COMMAND_ID],
        });
        spawnDog(engine, player, tm.grid.gridToWorld(4, 4), { extraAbilities: [FLING_THORN_ABILITY_ID] });
        // One cell east of the spirit, 120 px from the owner (inside the 150 px guard engage leash).
        const dummyPos = tm.grid.gridToWorld(5, 4);
        spawnStaticDummy(engine, 'enemy1', dummyPos);

        const unitId = player.id;
        engine.state.orderMgr.queueOrder(PREEMPT_COMMAND_TICK, {
            unitId,
            abilityId: FLING_THORN_COMMAND_ID,
            targets: [pixel(dummyPos)],
            targetsByLabel: { [FLING_THORN_AIM_LABEL]: pixel(dummyPos) },
        });
        for (const tick of [120, 240, 360]) {
            engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
        }
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const t = trackerOf(engine);
        const enemy = engine.getUnit('enemy1');
        if (!enemy) return false;
        const bites = t.dogCasts.filter((id) => id === DOG_BITE_ABILITY_ID).length;
        return (
            t.dogPreempted.includes(DOG_BITE_ABILITY_ID) &&
            t.thornHits > 0 &&
            enemy.maxHp - enemy.hp > bites * DOG_BITE_DAMAGE
        );
    },

    failureMessage(engine) {
        const t = trackerOf(engine);
        const enemy = engine.getUnit('enemy1');
        return (
            `dog casts=[${t.dogCasts.join(',')}] preempted=[${t.dogPreempted.join(',')}] ` +
            `thorn hits=${t.thornHits} enemy dmg=${enemy ? enemy.maxHp - enemy.hp : '?'}`
        );
    },
};

// ---- Scenario 4: a held spirit refuses a command ----

/** Mid-storm ticks (the storm window runs 0.95 s to 2.55 s). */
const STORM_PET_ORDER_TICK = 90;
const STORM_CARD_TICK = 100;
/** How close to the storm point the spirit must be when the storm ends (px). */
const STORM_POINT_SLACK = 8;

/** 40 px north of the owner's start: about 60 px from the spirit and inside its anchor radius. */
function stormPointOf(engine: GameEngine): { x: number; y: number } {
    const p = engine.terrainManager!.grid.gridToWorld(4, 4);
    return { x: p.x, y: p.y - 40 };
}

/**
 * The player casts Spirit Storm (0713) and sends the spirit to a storm point. Mid-storm, two Fling Thorns
 * orders arrive: a Major order straight to the spirit (what the card queues), and the player playing the
 * Fling Thorns card. The held spirit counts as Major, so the order is dropped (equal priority can't
 * preempt) and the card finds no free spirit.
 *
 * Assertions:
 *   1. The storm ran and finished.
 *   2. The spirit was at its storm point while the storm ran (the storm point is inside its 50 px anchor
 *      radius round the owner, so it has no reason to walk off during the cooldown).
 *   3. The spirit never cast Fling Thorns and no thorn projectile ever existed.
 */
export const petBusyBlocksCommandScenario: ScenarioDefinition = {
    id: 'pet_busy_blocks_command',
    title: 'Cast priority: a spirit held by Spirit Storm ignores a Fling Thorns command',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 8000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 10, gridH: 9, localPlayerId: P, grass: true });
        trackPetPriority(engine);
        const tm = engine.terrainManager!;

        const playerPos = tm.grid.gridToWorld(4, 4);
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: playerPos.x,
            y: playerPos.y,
            abilities: [SPIRIT_STORM_ABILITY_ID, FLING_THORN_COMMAND_ID],
        });
        spawnDog(engine, player, { x: playerPos.x + 45, y: playerPos.y }, { extraAbilities: [FLING_THORN_ABILITY_ID] });

        const aim = { x: playerPos.x + 160, y: playerPos.y };
        engine.state.orderMgr.queueOrder(STORM_PET_ORDER_TICK, {
            unitId: 'dog1',
            abilityId: FLING_THORN_ABILITY_ID,
            targets: [pixel(aim)],
            castPriority: CAST_PRIORITY.Major,
        });
        engine.state.orderMgr.queueOrder(STORM_CARD_TICK, {
            unitId: player.id,
            abilityId: FLING_THORN_COMMAND_ID,
            targets: [pixel(aim)],
            targetsByLabel: { [FLING_THORN_AIM_LABEL]: pixel(aim) },
        });
        for (const tick of [240, 360]) {
            engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
        }
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const stormPoint = pixel(stormPointOf(engine));
        return [{
            unitId: player.id,
            abilityId: SPIRIT_STORM_ABILITY_ID,
            targets: [stormPoint],
            targetsByLabel: { [SPIRIT_STORM_REPOSITION_LABEL]: stormPoint },
        }];
    },

    assertPass(engine) {
        const t = trackerOf(engine);
        const player = engine.getLocalPlayerUnit()!;
        const dog = engine.getUnit('dog1');
        if (!dog) return false;
        if (engine.projectiles.some((p) => p.sourceAbilityId === FLING_THORN_ABILITY_ID)) t.sawThornProjectile = true;
        const storming = player.activeAbilities.some((a) => a.abilityId === SPIRIT_STORM_ABILITY_ID);
        if (storming) {
            // Closest the spirit got to the storm point: once the spin window ends it is free to follow its
            // owner again while the storm's cast winds down.
            const sp = stormPointOf(engine);
            const prev = t.dogPosDuringStorm;
            if (!prev || Math.hypot(dog.x - sp.x, dog.y - sp.y) < Math.hypot(prev.x - sp.x, prev.y - sp.y)) {
                t.dogPosDuringStorm = { x: dog.x, y: dog.y };
            }
            return false;
        }
        if (!t.stormStarted || !t.dogPosDuringStorm) return false;
        const sp = stormPointOf(engine);
        const atPoint = Math.hypot(t.dogPosDuringStorm.x - sp.x, t.dogPosDuringStorm.y - sp.y) <= STORM_POINT_SLACK;
        return atPoint && !t.dogCasts.includes(FLING_THORN_ABILITY_ID) && !t.sawThornProjectile;
    },

    failureMessage(engine) {
        const t = trackerOf(engine);
        const sp = stormPointOf(engine);
        const d = t.dogPosDuringStorm;
        return (
            `storm started=${t.stormStarted} dog casts=[${t.dogCasts.join(',')}] ` +
            `thorn projectile=${t.sawThornProjectile} ` +
            `dog at storm end=${d ? `(${d.x.toFixed(0)},${d.y.toFixed(0)})` : 'none'} ` +
            `storm point=(${sp.x.toFixed(0)},${sp.y.toFixed(0)})`
        );
    },
};

// ---- Displacement Strike (0715 → 0716): spirit clones ----

/** What the Displacement Strike scenarios saw (one tracker per engine, so reruns start clean). */
interface CloneTracker {
    spiritId: string;
    /** Every Clone-tagged pet of the owner seen alive. */
    cloneIds: Set<string>;
    /** Every damage instance: who hit whom, when, and whether the source was mid Spirit Flurry. */
    hits: { target: string; source: string | null; time: number; inFlurry: boolean }[];
    /** Death gameTime per unit id. */
    deaths: Map<string, number>;
    /** The first clone that started Pounce (from Sic 'em), if any. */
    pounceCloneId: string | null;
    /** That clone's despawn time when it started its flurry. */
    pounceCloneDespawnAt: number | null;
}

const cloneTrackers = new WeakMap<GameEngine, CloneTracker>();

function trackClones(engine: GameEngine, spiritId: string): CloneTracker {
    const t: CloneTracker = {
        spiritId,
        cloneIds: new Set(),
        hits: [],
        deaths: new Map(),
        pounceCloneId: null,
        pounceCloneDespawnAt: null,
    };
    engine.eventBus.on('damage_taken', (e) => {
        const src = e.sourceUnitId ? engine.getUnit(e.sourceUnitId) : undefined;
        const inFlurry = src?.activeAbilities.some((a) => a.abilityId === SPIRIT_FLURRY_ABILITY_ID) ?? false;
        t.hits.push({ target: e.unitId, source: e.sourceUnitId, time: engine.gameTime, inFlurry });
    });
    engine.eventBus.on('unit_died', (e) => {
        if (!t.deaths.has(e.unitId)) t.deaths.set(e.unitId, engine.gameTime);
    });
    engine.eventBus.on('ability_used', (e) => {
        const unit = engine.getUnit(e.unitId);
        if (!unit || !hasUnitTag(unit, UnitTag.Clone)) return;
        if (e.abilityId === POUNCE_ABILITY_ID && t.pounceCloneId === null) t.pounceCloneId = e.unitId;
        if (e.abilityId === SPIRIT_FLURRY_ABILITY_ID && e.unitId === t.pounceCloneId) {
            t.pounceCloneDespawnAt = unit.ephemeralDespawnAtGameTime ?? null;
        }
    });
    cloneTrackers.set(engine, t);
    return t;
}

function cloneTrackerOf(engine: GameEngine): CloneTracker {
    return cloneTrackers.get(engine)!;
}

function livingClonesOf(engine: GameEngine): Unit[] {
    const owner = engine.getLocalPlayerUnit();
    if (!owner) return [];
    return getLivingPetsOfUnit(owner, engine.units).filter((u) => hasUnitTag(u, UnitTag.Clone));
}

/** Record the clones alive this tick (called from `assertPass`, which runs every tick). */
function noteClones(engine: GameEngine): Unit[] {
    const t = cloneTrackerOf(engine);
    const clones = livingClonesOf(engine);
    for (const c of clones) t.cloneIds.add(c.id);
    return clones;
}

const POUNCE_ABILITY_ID = '0702';
const SIC_EM_CARD_ID = '0704';
const DS_OWNER_POS = { x: 200, y: 200 };
/** The real spirit: 60 px east of its owner. */
const DS_SPIRIT_POS = { x: 260, y: 200 };
/** Strike target: 120 px from the spirit (inside the card's 150 px), 180 px from the owner (outside guard range). */
const DS_TARGET_POS = { x: 380, y: 200 };

/** Owner with the given cards, a guarding spirit that owns Displacement Strike, and the strike target dummy. */
function buildDisplacementBattle(cards: string[], targetHp: number): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 16, gridH: 11, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, { playerId: P, x: DS_OWNER_POS.x, y: DS_OWNER_POS.y, abilities: cards });
    const spirit = spawnPetForOwner(engine, player, {
        petDefId: 'dog',
        at: DS_SPIRIT_POS,
        abilityIds: [...getPetDef('dog')!.abilityIds, DISPLACEMENT_STRIKE_PET_ABILITY_ID],
        maxHp: 30,
        spawnSource: 'initialGameSpawn',
    })!;
    trackClones(engine, spirit.id);
    const target = createTargetDummyAtWorld(engine, DS_TARGET_POS.x, DS_TARGET_POS.y, { id: 'target', hp: targetHp });
    initializeAbilityRuntimeForUnit(target);
    engine.addUnit(target, 'initialGameSpawn');
    return engine;
}

function displacementOrder(engine: GameEngine) {
    const aim = pixel(DS_TARGET_POS);
    return {
        unitId: engine.getLocalPlayerUnit()!.id,
        abilityId: DISPLACEMENT_STRIKE_CARD_ID,
        targets: [aim],
        targetsByLabel: { [DISPLACEMENT_STRIKE_AIM_LABEL]: aim },
    };
}

function queuePlayerWaits(engine: GameEngine, untilTick: number): void {
    const unitId = engine.getLocalPlayerUnit()!.id;
    for (let tick = 60; tick <= untilTick; tick += 60) {
        engine.state.orderMgr.queueOrder(tick, { unitId, abilityId: 'wait', targets: [] });
    }
}

// ---- Scenario 5: Displacement Strike clones hunt, then fade ----

/**
 * The player plays Displacement Strike (0715) at a fragile dummy; the spirit casts 0716 and three clones appear round
 * it and open on it. The fragile dummy dies quickly, so the clones (autoEngage, 400 px engage leash round the owner)
 * hunt the two sturdy dummies beyond it. After their 6 s they fade; the real spirit stays.
 *
 * Assertions:
 *   1. Exactly 3 clones ever existed.
 *   2. A clone hit the strike target, and a clone hit one of the other dummies (hunting).
 *   3. Past 6 s no clones are alive (the 7.5 s cap fails a lingering clone) and the real spirit is alive.
 */
export const petDisplacementStrikeClonesHuntScenario: ScenarioDefinition = {
    id: 'pet_displacement_strike_clones_hunt',
    title: 'Displacement Strike (0715 + 0716): three spirit clones strike the target, hunt other enemies, then fade',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 7500,

    buildEngine() {
        // The spirit's strike (3) plus two clone bites (1 each) kill it, so the clones must hunt the others.
        const engine = buildDisplacementBattle([DISPLACEMENT_STRIKE_CARD_ID], 5);
        for (const [id, pos] of [['dummyN', { x: 460, y: 100 }], ['dummyS', { x: 460, y: 300 }]] as const) {
            const d = createTargetDummyAtWorld(engine, pos.x, pos.y, { id, hp: 1000 });
            initializeAbilityRuntimeForUnit(d);
            engine.addUnit(d, 'initialGameSpawn');
        }
        queuePlayerWaits(engine, 480);
        return engine;
    },

    getInitialOrders(engine) {
        return [displacementOrder(engine)];
    },

    assertPass(engine) {
        const t = cloneTrackerOf(engine);
        const living = noteClones(engine);
        const spirit = engine.getUnit(t.spiritId);
        const cloneHit = (target: string) =>
            t.hits.some((h) => h.target === target && h.source !== null && t.cloneIds.has(h.source));
        return (
            t.cloneIds.size === DISPLACEMENT_STRIKE_CLONE_COUNT &&
            cloneHit('target') &&
            (cloneHit('dummyN') || cloneHit('dummyS')) &&
            living.length === 0 &&
            engine.gameTime >= DISPLACEMENT_STRIKE_CLONE_SECONDS &&
            (spirit?.isAlive() ?? false)
        );
    },

    failureMessage(engine) {
        const t = cloneTrackerOf(engine);
        const cloneHits = (target: string) =>
            t.hits.filter((h) => h.target === target && h.source !== null && t.cloneIds.has(h.source)).length;
        return (
            `clones seen=${t.cloneIds.size} living=${livingClonesOf(engine).length} ` +
            `clone hits: target=${cloneHits('target')} N=${cloneHits('dummyN')} S=${cloneHits('dummyS')} ` +
            `spirit alive=${engine.getUnit(t.spiritId)?.isAlive() ?? false} t=${engine.gameTime.toFixed(2)}`
        );
    },
};

// ---- Scenario 6: a lingering clone finishes its cast ----

/**
 * Tick the player plays Sic 'em (5.4 s): the clones appear about 0.3 s in and last 6 s, so the commanded clone's
 * Pounce (0.5 s) into Spirit Flurry (1.0 s) is still running when its time is up.
 */
const DS_SIC_EM_TICK = 324;

/**
 * After Displacement Strike, the clones bite the (sturdy) target. Near the end of their lifetime the player plays
 * Sic 'em (0704) at the target: the nearest free pet there is a clone (the real spirit went back to guard its owner),
 * so a clone pounces and locks on into Spirit Flurry. Its 6 s run out mid-flurry; with the `'finishCast'` expiry
 * policy it lingers until the flurry is over, then fades.
 *
 * Assertions:
 *   1. A clone (not the real spirit) cast Pounce, so clones are orderable.
 *   2. Every Spirit Flurry strike landed, the last one after the clone's despawn time.
 *   3. It died after its despawn time and within 0.5 s of its last flurry strike.
 */
export const petDisplacementCloneFinishesCastScenario: ScenarioDefinition = {
    id: 'pet_displacement_clone_finishes_cast',
    title: "Displacement Strike: a clone ordered by Sic 'em finishes its Spirit Flurry past its 6 s, then fades",
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 9000,

    buildEngine() {
        const engine = buildDisplacementBattle([DISPLACEMENT_STRIKE_CARD_ID, SIC_EM_CARD_ID], 1000);
        engine.state.orderMgr.queueOrder(DS_SIC_EM_TICK, {
            unitId: engine.getLocalPlayerUnit()!.id,
            abilityId: SIC_EM_CARD_ID,
            targets: [pixel(DS_TARGET_POS)],
        });
        queuePlayerWaits(engine, 480);
        return engine;
    },

    getInitialOrders(engine) {
        return [displacementOrder(engine)];
    },

    assertPass(engine) {
        const t = cloneTrackerOf(engine);
        noteClones(engine);
        const id = t.pounceCloneId;
        if (!id || t.pounceCloneDespawnAt === null) return false;
        const died = t.deaths.get(id);
        if (died === undefined) return false;
        const strikes = t.hits.filter((h) => h.source === id && h.inFlurry);
        if (strikes.length < SPIRIT_FLURRY_ANGLES.length) return false;
        const lastStrike = Math.max(...strikes.map((h) => h.time));
        return (
            id !== t.spiritId &&
            died > t.pounceCloneDespawnAt &&
            lastStrike > t.pounceCloneDespawnAt &&
            died - lastStrike <= 0.5
        );
    },

    failureMessage(engine) {
        const t = cloneTrackerOf(engine);
        const id = t.pounceCloneId;
        const strikes = id ? t.hits.filter((h) => h.source === id && h.inFlurry) : [];
        const died = id ? t.deaths.get(id) : undefined;
        return (
            `pounce clone=${id ?? 'none'} despawnAt=${t.pounceCloneDespawnAt?.toFixed(2) ?? '?'} ` +
            `died=${died !== undefined ? died.toFixed(2) : 'alive'} ` +
            `flurry strikes=[${strikes.map((h) => h.time.toFixed(2)).join(',')}] clones seen=${t.cloneIds.size} ` +
            `t=${engine.gameTime.toFixed(2)}`
        );
    },
};


// ---- Scenarios 7-8: Guard (0712) ----

const GUARD_HIT_DAMAGE = 5;
const GUARD_OWNER_POS = { x: 200, y: 200 };
/** Within this many px of the shielded unit counts as "beside" it (the return emerges at its position). */
const GUARD_BESIDE_PX = 80;

interface GuardRun {
    ownerId: string;
    spiritIds: string[];
    /** Game times (s) at which a hit lands on the owner. */
    hitTimes: number[];
    nextHit: number;
    /** Damage each hit actually dealt, and how many spirits were exiled when it landed. */
    hits: { dealt: number; exiled: number }[];
}

const guardRuns = new WeakMap<GameEngine, GuardRun>();

/** The owner (a lot of HP, so the hits never kill it), `spiritCount` spirits beside it, and the Guard card with that many uses. */
function buildGuardBattle(spiritCount: number, hitTimes: number[]): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 16, gridH: 11, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: GUARD_OWNER_POS.x,
        y: GUARD_OWNER_POS.y,
        abilities: [GUARD_ABILITY_ID],
    });
    player.maxHp = 200;
    player.hp = 200;
    player.abilityRuntime[GUARD_ABILITY_ID]!.maxUses = spiritCount;
    player.abilityRuntime[GUARD_ABILITY_ID]!.currentUses = spiritCount;
    const spiritIds: string[] = [];
    for (let i = 0; i < spiritCount; i++) {
        const spirit = spawnPetForOwner(engine, player, {
            petDefId: 'dog',
            at: { x: GUARD_OWNER_POS.x + (i === 0 ? 60 : -60), y: GUARD_OWNER_POS.y },
            abilityIds: [...getPetDef('dog')!.abilityIds],
            maxHp: 30,
            spawnSource: 'initialGameSpawn',
        })!;
        spiritIds.push(spirit.id);
    }
    guardRuns.set(engine, { ownerId: player.id, spiritIds, hitTimes, nextHit: 0, hits: [] });
    return engine;
}

function guardOrder(engine: GameEngine) {
    const owner = engine.getLocalPlayerUnit()!;
    const target: ResolvedTarget = { type: 'unit', unitId: owner.id };
    return {
        unitId: owner.id,
        abilityId: GUARD_ABILITY_ID,
        targets: [target],
        targetsByLabel: { [GUARD_TARGET_LABEL]: target },
    };
}

/** Land the scheduled hits (the "enemy"), recording what each dealt. Called from `assertPass`, which runs every tick. */
function runGuardHits(engine: GameEngine): GuardRun {
    const run = guardRuns.get(engine)!;
    const owner = engine.getUnit(run.ownerId);
    while (owner && run.nextHit < run.hitTimes.length && engine.gameTime >= run.hitTimes[run.nextHit]!) {
        const before = owner.hp;
        owner.takeDamage(GUARD_HIT_DAMAGE, 'guard_tester', engine.eventBus);
        run.hits.push({ dealt: before - owner.hp, exiled: engine.getExiledUnits().length });
        run.nextHit++;
    }
    return run;
}

function guardSpiritsBeside(engine: GameEngine, run: GuardRun): boolean {
    const owner = engine.getUnit(run.ownerId);
    if (!owner) return false;
    return run.spiritIds.every((id) => {
        const s = engine.getUnit(id);
        return !!s && Math.hypot(s.x - owner.x, s.y - owner.y) <= GUARD_BESIDE_PX;
    });
}

function guardFailure(engine: GameEngine): string {
    const run = guardRuns.get(engine)!;
    return (
        `hits dealt=[${run.hits.map((h) => h.dealt).join(',')}] exiled at hits=[${run.hits.map((h) => h.exiled).join(',')}] ` +
        `exiled now=${engine.getExiledUnits().length} spirits in play=` +
        `${run.spiritIds.filter((id) => engine.getUnit(id)).length}/${run.spiritIds.length} t=${engine.gameTime.toFixed(2)}`
    );
}

/**
 * The player casts Guard (0712) on themself. The spirit leaves the map, and an "enemy" lands 5-damage hits on the owner
 * every 2 s. When the 10 s shield ends the spirit emerges beside the owner again.
 *
 * Assertions:
 *   1. Every hit dealt 5 - 2 = 3 (the guard shield refills to its floor after each hit).
 *   2. The spirit was exiled (off the map) at every hit.
 *   3. Once the shield has ended the spirit is back in play beside the owner and nothing is exiled.
 */
export const petGuardShieldReducesHitsScenario: ScenarioDefinition = {
    id: 'pet_guard_shield_reduces_hits',
    title: 'Guard (0712): the spirit leaves the map, each hit is reduced by 2, then the spirit re-emerges at the owner',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 14000,

    buildEngine() {
        const engine = buildGuardBattle(1, [2, 4, 6]);
        queuePlayerWaits(engine, 840);
        return engine;
    },

    getInitialOrders(engine) {
        return [guardOrder(engine)];
    },

    assertPass(engine) {
        const run = runGuardHits(engine);
        return (
            engine.gameTime > GUARD_SECONDS + 1.5 &&
            run.hits.length === 3 &&
            run.hits.every((h) => h.dealt === GUARD_HIT_DAMAGE - GUARD_SHIELD_FLOOR && h.exiled === 1) &&
            engine.getExiledUnits().length === 0 &&
            guardSpiritsBeside(engine, run)
        );
    },

    failureMessage: guardFailure,
};

/**
 * Two spirits guard the same owner (two casts of Guard), so the floor is 4: a 5-damage hit deals 1. When their shields
 * end both spirits emerge beside the owner.
 *
 * Assertions:
 *   1. Both spirits were exiled at the hits, and each hit dealt 5 - 4 = 1.
 *   2. After the shields end both spirits are back in play beside the owner.
 */
export const petGuardTwoSpiritsStackScenario: ScenarioDefinition = {
    id: 'pet_guard_two_spirits_stack',
    title: 'Guard (0712): two spirits guarding one ally stack to a floor of 4, then both re-emerge at the ally',
    category: 'general',
    generalSection: 'Pets',
    maxDurationMs: 15000,

    buildEngine() {
        const engine = buildGuardBattle(2, [3, 5]);
        // The second cast, a little after the first (past Guard's 0.4 s cooldown).
        engine.state.orderMgr.queueOrder(40, guardOrder(engine));
        queuePlayerWaits(engine, 900);
        return engine;
    },

    getInitialOrders(engine) {
        return [guardOrder(engine)];
    },

    assertPass(engine) {
        const run = runGuardHits(engine);
        return (
            engine.gameTime > GUARD_SECONDS + 2.5 &&
            run.hits.length === 2 &&
            run.hits.every((h) => h.dealt === GUARD_HIT_DAMAGE - 2 * GUARD_SHIELD_FLOOR && h.exiled === 2) &&
            engine.getExiledUnits().length === 0 &&
            guardSpiritsBeside(engine, run)
        );
    },

    failureMessage: guardFailure,
};
