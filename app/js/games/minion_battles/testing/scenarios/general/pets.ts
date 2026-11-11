/**
 * Pet system ability-test scenarios.
 * Covers the spirit animal: guarding (anchored on the owner, never auto-engaging), Sic 'em / Pounce
 * (0704/0702) locking on into Spirit Flurry (0711), and cast priority (`game/units/castPriority.ts`):
 * a commanded (Major) cast replacing a bite, and a spirit held by Spirit Storm refusing a command.
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
import { SPIRIT_FLURRY_ANGLES } from '../../../card_defs/07_command_core/0711_SpiritFlurry/0711Ability';
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
