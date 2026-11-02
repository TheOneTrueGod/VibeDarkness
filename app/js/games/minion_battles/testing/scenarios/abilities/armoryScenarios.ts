/**
 * Armory Core (10xx) — high-level AbilityTests through the real order path.
 *
 * Three scenarios, one per Armory kit, because each kit is a different engine piece:
 * - `armory_sword_cycle` — `defineConjure` + held-weapon swap + a token per swing + `defineThrownWeapon` echoing
 *   from that token + the thrown sword's token
 *   (and its checkpoint round-trip).
 * - `armory_turret_fires_and_expires` — the folded-turret delivery and a `DeployableDef` firing its own charges.
 * - `armory_shield_block_and_bounce` — the directional block granting Charge, then a bouncing thrown buckler.
 * - `armory_repair_post_heals_allies` — a `healPulse` deployable healing the caster each quarter round, not an enemy.
 * - `armory_mace_whirl_echo` — Create Mace twice (the second drops the first as a token), then Whirl: an `ArcSweep`
 *   around the caster and, through Echo, around the dropped mace, which is destroyed.
 *
 * Later casts are pre-queued in `buildEngine()` with `orderMgr.queueOrder(futureTick, …)`, after the previous
 * cast's cooldown has ended (see the ability-tests skill).
 */

import type { ScenarioDefinition } from '../../types';
import type { BattleOrder, ResolvedTarget } from '../../../game/types';
import { GameEngine } from '../../../game/GameEngine';
import { Projectile } from '../../../game/projectiles/Projectile';
import { DEPLOYABLE_DELIVERY_PROJECTILE_TYPE } from '../../../game/fieldObjects/deployableDefs';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { swordItem } from '../../../character_defs/items/weapons/013_sword';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    ARMORY_NODE_CORE,
    ARMORY_NODE_CREATE_MACE,
    ARMORY_NODE_CREATE_SHIELD,
    ARMORY_NODE_REPAIR_POST,
    ARMORY_TREE_ID,
} from '../../../../../researchTrees/trees/armory';
import { registerArmoryContent } from '../../../card_defs/10_armory_core/register';
import { MACE_WHIRL_SWEEP_END, WHIRL_TARGET_LABEL } from '../../../card_defs/10_armory_core/1007_Whirl/1007Ability';
import { WHIRL_DAMAGE } from '../../../card_defs/10_armory_core/1007_Whirl/1007Constants';
import { DROPPED_WEAPON_ARC_ANGLE, DROPPED_WEAPON_ARC_DISTANCE } from '../../../game/fieldObjects/landing';
import {
    ARMORY_CREATE_CHARGE_COST,
    CREATE_MACE_ABILITY_ID,
    CREATE_SHIELD_ABILITY_ID,
    CREATE_SWORD_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    DEPLOY_TURRET_ABILITY_ID,
    DROPPED_WEAPON_KIND_MACE,
    DROPPED_WEAPON_KIND_SHIELD,
    DROPPED_WEAPON_KIND_SWORD,
    IMPROVISED_SWORD_ABILITY_ID,
    REPAIR_POST_ABILITY_ID,
    THROW_SHIELD_ABILITY_ID,
    THROW_SWORD_ABILITY_ID,
    WHIRL_ABILITY_ID,
} from '../../../card_defs/10_armory_core/armoryConstants';
import { IMPROVISED_SWORD_COOLDOWN_END, IMPROVISED_SWORD_DAMAGE } from '../../../card_defs/10_armory_core/1002_ImprovisedSword/1002Constants';
import {
    THROW_SWORD_AIM_LABEL,
    THROW_SWORD_COOLDOWN_END,
    THROW_SWORD_DAMAGE,
} from '../../../card_defs/10_armory_core/1003_ThrowSword/1003Constants';
import {
    TURRET_AIM_LABEL,
    TURRET_FIRST_SHOT_DELAY,
    TURRET_LIFETIME,
    TURRET_PLACE_LABEL,
    TURRET_SHOT_COUNT,
    TURRET_SHOT_DAMAGE,
} from '../../../card_defs/10_armory_core/1004_DeployTurret/1004Constants';
import {
    CREATE_SHIELD_AIM_LABEL,
    CREATE_SHIELD_CAST_DURATION,
    SHIELD_BLOCK_CHARGE_GRANT,
} from '../../../card_defs/10_armory_core/1008_CreateShield/1008Constants';
import {
    THROW_SHIELD_AIM_LABEL,
    THROW_SHIELD_COOLDOWN_END,
    THROW_SHIELD_DAMAGE,
} from '../../../card_defs/10_armory_core/1010_ThrowShield/1010Constants';
import {
    REPAIR_POST_HEAL,
    REPAIR_POST_LIFETIME,
    REPAIR_POST_PLACE_LABEL,
    REPAIR_POST_PULSES,
} from '../../../card_defs/10_armory_core/1011_RepairPost/1011Constants';

const P = TINY_BATTLE_PLAYER_ID;
/** Swing Sword is the stowed weapon ability the conjured sword replaces. */
const STOWED_WEAPON_ABILITY_ID = swordItem.cardsToAdd[0]!;
/** Slack between one cast's cooldown ending and the next queued order. */
const ORDER_GAP = 0.2;

function toTick(seconds: number): number {
    return Math.ceil(seconds * 60);
}

function cellCentre(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function pixel(position: { x: number; y: number }): ResolvedTarget {
    return { type: 'pixel', position: { x: position.x, y: position.y } };
}

/** A pixel-aimed order that also names the pick by its select label (as the live targeting UI does). */
function aimedOrder(unitId: string, abilityId: string, label: string, at: { x: number; y: number }): BattleOrder {
    return {
        unitId,
        abilityId,
        targets: [pixel(at)],
        targetsByLabel: { [label]: pixel(at) },
    };
}

/** Armory battle the way the mission path builds it: sword equipped, Armory research, Charge at mission start. */
function buildArmoryEngine(gridW: number, gridH: number, playerAt: { x: number; y: number }, nodes: string[]): GameEngine {
    registerArmoryContent();
    const engine = buildTinyBattleEngine({ gridW, gridH, localPlayerId: P, grass: true });
    placePlayerFromLoadout(engine, {
        playerId: P,
        world: playerAt,
        equipment: [CORE_ITEM_IDS.BasicCore, swordItem.id],
        researchTrees: { [ARMORY_TREE_ID]: nodes },
    });
    return engine;
}

/** The player unit id (not the player id) that orders name. */
function playerUnitId(engine: GameEngine): string {
    return engine.getLocalPlayerUnit()!.id;
}

function damageTaken(engine: GameEngine, unitId: string): number {
    const unit = engine.getUnit(unitId);
    return unit ? unit.maxHp - unit.hp : 0;
}

function charge(engine: GameEngine): number {
    return engine.getLocalPlayerUnit()?.getResource('charge')?.current ?? 0;
}

// ---------------------------------------------------------------------------
// armory_sword_cycle
// ---------------------------------------------------------------------------

const SWORD_PLAYER = cellCentre(3, 3);
const SWORD_SWING_DUMMY_ID = 'armory_sword_swing_dummy';
const SWORD_THROW_DUMMY_ID = 'armory_sword_throw_dummy';
/** Two tiles right: inside the Charge Sword lunge + reach. */
const SWORD_SWING_DUMMY = { x: SWORD_PLAYER.x + 2 * CELL_SIZE, y: SWORD_PLAYER.y };
/** Three tiles down: a different line from the swing, inside throw range. */
const SWORD_THROW_DUMMY = { x: SWORD_PLAYER.x, y: SWORD_PLAYER.y + 3 * CELL_SIZE };

const SWING_AT = CREATE_SWORD_CAST_DURATION + ORDER_GAP;
const THROW_AT = SWING_AT + IMPROVISED_SWORD_COOLDOWN_END + ORDER_GAP;
/** Throw cooldown plus flight time and the toss that leaves the token. */
const SWORD_CHECK_AT = THROW_AT + THROW_SWORD_COOLDOWN_END + 0.6;
const SWORD_KEEP_ALIVE_AT = SWORD_CHECK_AT + 0.5;

/** Checkpoint round-trip result, computed once per engine. */
const swordRoundTrip = new WeakMap<GameEngine, string | null>();

function swordCycleProblem(engine: GameEngine): string | null {
    const player = engine.getLocalPlayerUnit();
    if (!player) return 'no player';
    if (damageTaken(engine, SWORD_SWING_DUMMY_ID) < IMPROVISED_SWORD_DAMAGE) {
        return `swing dummy took ${damageTaken(engine, SWORD_SWING_DUMMY_ID)} (want >= ${IMPROVISED_SWORD_DAMAGE})`;
    }
    // The swing drops a sword token, so the throw also echoes from it at the same dummy.
    const wantThrow = THROW_SWORD_DAMAGE * 2;
    if (damageTaken(engine, SWORD_THROW_DUMMY_ID) !== wantThrow) {
        return `throw dummy took ${damageTaken(engine, SWORD_THROW_DUMMY_ID)} (want ${wantThrow}: throw and echo)`;
    }
    const tokens = engine.state.fieldObjects.droppedWeapons;
    if (tokens.length !== 1 || tokens[0]!.kind !== DROPPED_WEAPON_KIND_SWORD) {
        return `tokens=${JSON.stringify(tokens.map((t) => t.kind))} (want one sword)`;
    }
    if (player.heldConjuredWeapon) return `still holding ${player.heldConjuredWeapon.defId}`;
    if (player.abilities.includes(IMPROVISED_SWORD_ABILITY_ID) || player.abilities.includes(THROW_SWORD_ABILITY_ID)) {
        return `held abilities still granted: ${player.abilities.join(',')}`;
    }
    if (!player.abilities.includes(CREATE_SWORD_ABILITY_ID)) return 'Create Sword not back';
    if (player.abilityRuntime[STOWED_WEAPON_ABILITY_ID]?.active === false) return 'stowed weapon still inactive';

    let roundTrip = swordRoundTrip.get(engine);
    if (roundTrip === undefined) {
        const restored = GameEngine.fromJSON(engine.toJSON(), P, engine.terrainManager);
        const restoredPlayer = restored.getLocalPlayerUnit();
        const restoredTokens = restored.state.fieldObjects.droppedWeapons;
        if (restoredTokens.length !== 1 || restoredTokens[0]!.id !== tokens[0]!.id || restoredTokens[0]!.kind !== tokens[0]!.kind) {
            roundTrip = `restored tokens=${JSON.stringify(restoredTokens.map((t) => [t.id, t.kind]))}`;
        } else if (!restoredPlayer || restoredPlayer.heldConjuredWeapon
            || restoredPlayer.abilityRuntime[STOWED_WEAPON_ABILITY_ID]?.active === false
            || !restoredPlayer.abilities.includes(CREATE_SWORD_ABILITY_ID)) {
            roundTrip = 'restored player lost its weapon abilities';
        } else {
            roundTrip = null;
        }
        restored.destroy();
        swordRoundTrip.set(engine, roundTrip);
    }
    return roundTrip;
}

export const armorySwordCycleScenario: ScenarioDefinition = {
    id: 'armory_sword_cycle',
    title: 'Armory: Create Sword, swing, throw, and the sword token survives a checkpoint',
    category: 'ability',
    maxDurationMs: Math.ceil((SWORD_KEEP_ALIVE_AT + 1) * 1000),

    buildEngine() {
        const engine = buildArmoryEngine(8, 8, SWORD_PLAYER, [ARMORY_NODE_CORE]);
        const me = playerUnitId(engine);
        placeTargetDummy(engine, SWORD_SWING_DUMMY, SWORD_SWING_DUMMY_ID);
        placeTargetDummy(engine, SWORD_THROW_DUMMY, SWORD_THROW_DUMMY_ID);
        engine.state.orderMgr.queueOrder(toTick(SWING_AT), {
            unitId: me,
            abilityId: IMPROVISED_SWORD_ABILITY_ID,
            targets: [pixel(SWORD_SWING_DUMMY)],
        });
        engine.state.orderMgr.queueOrder(
            toTick(THROW_AT),
            aimedOrder(me, THROW_SWORD_ABILITY_ID, THROW_SWORD_AIM_LABEL, SWORD_THROW_DUMMY),
        );
        engine.state.orderMgr.queueOrder(toTick(SWORD_KEEP_ALIVE_AT), { unitId: me, abilityId: 'wait', targets: [] });
        return engine;
    },

    getInitialOrders(engine) {
        const me = playerUnitId(engine);
        return [{ unitId: me, abilityId: CREATE_SWORD_ABILITY_ID, targets: [] }];
    },

    assertPass(engine) {
        if (engine.gameTime < SWORD_CHECK_AT) return false;
        return swordCycleProblem(engine) === null;
    },

    failureMessage(engine) {
        return `t=${engine.gameTime.toFixed(2)}s; ${swordCycleProblem(engine) ?? 'ok'}`;
    },
};

// ---------------------------------------------------------------------------
// armory_turret_fires_and_expires
// ---------------------------------------------------------------------------

const TURRET_PLAYER = cellCentre(1, 3);
const TURRET_PLACE = { x: TURRET_PLAYER.x + 2 * CELL_SIZE, y: TURRET_PLAYER.y };
const TURRET_AIM = { x: TURRET_PLACE.x + CELL_SIZE, y: TURRET_PLACE.y };
const TURRET_DUMMY_ID = 'armory_turret_dummy';
/** Straight down the turret's facing, inside its shot range. */
const TURRET_DUMMY = { x: TURRET_PLACE.x + 4 * CELL_SIZE, y: TURRET_PLACE.y };
/** Cast + flight is well under a second; the turret then lives its whole lifetime. */
const TURRET_GONE_BY = 1 + TURRET_LIFETIME;
const TURRET_KEEP_ALIVE_AT = TURRET_GONE_BY + 0.5;

interface TurretTrack {
    seenTurret: boolean;
    shots: number;
    seenProjectiles: Set<string>;
}
const turretTracks = new WeakMap<GameEngine, TurretTrack>();

function trackTurret(engine: GameEngine): TurretTrack {
    let track = turretTracks.get(engine);
    if (!track) {
        track = { seenTurret: false, shots: 0, seenProjectiles: new Set() };
        turretTracks.set(engine, track);
    }
    if (engine.state.fieldObjects.placedDeployables.length > 0) track.seenTurret = true;
    for (const projectile of engine.projectiles) {
        if (track.seenProjectiles.has(projectile.id)) continue;
        track.seenProjectiles.add(projectile.id);
        if (projectile.projectileType === DEPLOYABLE_DELIVERY_PROJECTILE_TYPE) continue;
        if (projectile.sourceAbilityId === DEPLOY_TURRET_ABILITY_ID) track.shots += 1;
    }
    return track;
}

export const armoryTurretFiresAndExpiresScenario: ScenarioDefinition = {
    id: 'armory_turret_fires_and_expires',
    title: 'Armory: Deploy Turret lands, fires its full shot count at a dummy, then expires',
    category: 'ability',
    maxDurationMs: Math.ceil((TURRET_KEEP_ALIVE_AT + 1) * 1000),

    buildEngine() {
        const engine = buildArmoryEngine(10, 7, TURRET_PLAYER, [ARMORY_NODE_CORE]);
        const me = playerUnitId(engine);
        placeTargetDummy(engine, TURRET_DUMMY, TURRET_DUMMY_ID);
        engine.state.orderMgr.queueOrder(toTick(TURRET_KEEP_ALIVE_AT), { unitId: me, abilityId: 'wait', targets: [] });
        return engine;
    },

    getInitialOrders(engine) {
        const me = playerUnitId(engine);
        return [{
            unitId: me,
            abilityId: DEPLOY_TURRET_ABILITY_ID,
            targets: [pixel(TURRET_PLACE), pixel(TURRET_AIM)],
            targetsByLabel: {
                [TURRET_PLACE_LABEL]: pixel(TURRET_PLACE),
                [TURRET_AIM_LABEL]: pixel(TURRET_AIM),
            },
        }];
    },

    assertPass(engine) {
        const track = trackTurret(engine);
        if (engine.gameTime < TURRET_FIRST_SHOT_DELAY) return false;
        return track.seenTurret
            && engine.state.fieldObjects.placedDeployables.length === 0
            && track.shots === TURRET_SHOT_COUNT
            && damageTaken(engine, TURRET_DUMMY_ID) === TURRET_SHOT_COUNT * TURRET_SHOT_DAMAGE;
    },

    failureMessage(engine) {
        const track = trackTurret(engine);
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `seenTurret=${track.seenTurret}`,
            `deployables=${engine.state.fieldObjects.placedDeployables.length}`,
            `shots=${track.shots} (want ${TURRET_SHOT_COUNT})`,
            `dummyDamage=${damageTaken(engine, TURRET_DUMMY_ID)} (want ${TURRET_SHOT_COUNT * TURRET_SHOT_DAMAGE})`,
        ].join('; ');
    },
};

// ---------------------------------------------------------------------------
// armory_shield_block_and_bounce
// ---------------------------------------------------------------------------

const SHIELD_PLAYER = cellCentre(3, 2);
/** Block toward the attacker on the right. */
const SHIELD_BLOCK_AIM = { x: SHIELD_PLAYER.x + 2 * CELL_SIZE, y: SHIELD_PLAYER.y };
const SHIELD_ATTACKER_ID = 'armory_shield_attacker';
/** Far enough from the throw dummies that the buckler never bounces to it. */
const SHIELD_ATTACKER = { x: SHIELD_PLAYER.x + 5 * CELL_SIZE, y: SHIELD_PLAYER.y };
const SHIELD_FIRST_ID = 'armory_shield_first';
const SHIELD_SECOND_ID = 'armory_shield_second';
const SHIELD_FIRST = { x: SHIELD_PLAYER.x, y: SHIELD_PLAYER.y + 2 * CELL_SIZE };
const SHIELD_SECOND = { x: SHIELD_FIRST.x - 1.5 * CELL_SIZE, y: SHIELD_FIRST.y + 1.5 * CELL_SIZE };
const SHIELD_THROW_AT = CREATE_SHIELD_CAST_DURATION + ORDER_GAP;
const SHIELD_CHECK_AT = SHIELD_THROW_AT + THROW_SHIELD_COOLDOWN_END + 0.8;
const SHIELD_KEEP_ALIVE_AT = SHIELD_CHECK_AT + 0.5;

interface ShieldTrack {
    startCharge: number;
    minCharge: number;
    startHp: number;
}
const shieldTracks = new WeakMap<GameEngine, ShieldTrack>();

function trackShield(engine: GameEngine): ShieldTrack {
    const track = shieldTracks.get(engine)!;
    track.minCharge = Math.min(track.minCharge, charge(engine));
    return track;
}

function shieldProblem(engine: GameEngine): string | null {
    const player = engine.getLocalPlayerUnit();
    if (!player) return 'no player';
    const track = trackShield(engine);
    if (player.hp !== track.startHp) return `player took damage (${track.startHp} -> ${player.hp}); block failed`;
    if (track.minCharge !== track.startCharge - ARMORY_CREATE_CHARGE_COST) {
        return `lowest Charge ${track.minCharge} (want ${track.startCharge - ARMORY_CREATE_CHARGE_COST})`;
    }
    const wantCharge = track.startCharge - ARMORY_CREATE_CHARGE_COST + SHIELD_BLOCK_CHARGE_GRANT;
    if (charge(engine) !== wantCharge) return `Charge ${charge(engine)} (want ${wantCharge} after the block)`;
    if (damageTaken(engine, SHIELD_FIRST_ID) !== THROW_SHIELD_DAMAGE) {
        return `first dummy took ${damageTaken(engine, SHIELD_FIRST_ID)} (want ${THROW_SHIELD_DAMAGE})`;
    }
    if (damageTaken(engine, SHIELD_SECOND_ID) !== THROW_SHIELD_DAMAGE) {
        return `second dummy took ${damageTaken(engine, SHIELD_SECOND_ID)} (want ${THROW_SHIELD_DAMAGE})`;
    }
    if (damageTaken(engine, SHIELD_ATTACKER_ID) !== 0) return 'buckler hit the attacker';
    const tokens = engine.state.fieldObjects.droppedWeapons;
    if (tokens.length !== 1 || tokens[0]!.kind !== DROPPED_WEAPON_KIND_SHIELD) {
        return `tokens=${JSON.stringify(tokens.map((t) => t.kind))} (want one buckler)`;
    }
    if (player.heldConjuredWeapon) return `still holding ${player.heldConjuredWeapon.defId}`;
    return null;
}

export const armoryShieldBlockAndBounceScenario: ScenarioDefinition = {
    id: 'armory_shield_block_and_bounce',
    title: 'Armory: Create Shield blocks a shot for Charge; Throw Shield bounces and leaves a buckler',
    category: 'ability',
    maxDurationMs: Math.ceil((SHIELD_KEEP_ALIVE_AT + 1) * 1000),

    buildEngine() {
        const engine = buildArmoryEngine(10, 7, SHIELD_PLAYER, [ARMORY_NODE_CORE, ARMORY_NODE_CREATE_SHIELD]);
        const me = playerUnitId(engine);
        const attacker = placeTargetDummy(engine, SHIELD_ATTACKER, SHIELD_ATTACKER_ID);
        placeTargetDummy(engine, SHIELD_FIRST, SHIELD_FIRST_ID);
        placeTargetDummy(engine, SHIELD_SECOND, SHIELD_SECOND_ID);
        // A hostile shot already on its way at the player; it arrives inside the block window.
        engine.addProjectile(new Projectile({
            x: SHIELD_PLAYER.x + 3 * CELL_SIZE,
            y: SHIELD_PLAYER.y,
            velocityX: -400,
            velocityY: 0,
            damage: 5,
            sourceTeamId: attacker.teamId,
            sourceUnitId: attacker.id,
            sourceAbilityId: 'throw_rock',
            maxDistance: CELL_SIZE * 4,
        }));
        engine.state.orderMgr.queueOrder(
            toTick(SHIELD_THROW_AT),
            aimedOrder(me, THROW_SHIELD_ABILITY_ID, THROW_SHIELD_AIM_LABEL, SHIELD_FIRST),
        );
        engine.state.orderMgr.queueOrder(toTick(SHIELD_KEEP_ALIVE_AT), { unitId: me, abilityId: 'wait', targets: [] });
        const player = engine.getLocalPlayerUnit()!;
        shieldTracks.set(engine, {
            startCharge: charge(engine),
            minCharge: charge(engine),
            startHp: player.hp,
        });
        return engine;
    },

    getInitialOrders(engine) {
        const me = playerUnitId(engine);
        return [aimedOrder(me, CREATE_SHIELD_ABILITY_ID, CREATE_SHIELD_AIM_LABEL, SHIELD_BLOCK_AIM)];
    },

    assertPass(engine) {
        trackShield(engine);
        if (engine.gameTime < SHIELD_CHECK_AT) return false;
        return shieldProblem(engine) === null;
    },

    failureMessage(engine) {
        return `t=${engine.gameTime.toFixed(2)}s; ${shieldProblem(engine) ?? 'ok'}`;
    },
};

// ---------------------------------------------------------------------------
// armory_repair_post_heals_allies
// ---------------------------------------------------------------------------

const REPAIR_PLAYER = cellCentre(2, 3);
const REPAIR_PLACE = { x: REPAIR_PLAYER.x + 2 * CELL_SIZE, y: REPAIR_PLAYER.y };
const REPAIR_DUMMY_ID = 'armory_repair_dummy';
/** An enemy inside the pulse: it must not be healed. */
const REPAIR_DUMMY = { x: REPAIR_PLACE.x + CELL_SIZE, y: REPAIR_PLACE.y + CELL_SIZE };
/** Missing HP at the start, more than four pulses restore. */
const REPAIR_WOUND = 20;
const REPAIR_GONE_BY = 1 + REPAIR_POST_LIFETIME;
const REPAIR_KEEP_ALIVE_AT = REPAIR_GONE_BY + 0.5;

export const armoryRepairPostHealsAlliesScenario: ScenarioDefinition = {
    id: 'armory_repair_post_heals_allies',
    title: 'Armory: Repair Post pulses each quarter round, healing the caster and not an enemy, then leaves',
    category: 'ability',
    maxDurationMs: Math.ceil((REPAIR_KEEP_ALIVE_AT + 1) * 1000),

    buildEngine() {
        const engine = buildArmoryEngine(10, 7, REPAIR_PLAYER, [ARMORY_NODE_CORE, ARMORY_NODE_REPAIR_POST]);
        const me = engine.getLocalPlayerUnit()!;
        me.hp = me.maxHp - REPAIR_WOUND;
        const dummy = placeTargetDummy(engine, REPAIR_DUMMY, REPAIR_DUMMY_ID);
        dummy.hp = dummy.maxHp - REPAIR_WOUND;
        engine.state.orderMgr.queueOrder(toTick(REPAIR_KEEP_ALIVE_AT), { unitId: me.id, abilityId: 'wait', targets: [] });
        return engine;
    },

    getInitialOrders(engine) {
        return [aimedOrder(playerUnitId(engine), REPAIR_POST_ABILITY_ID, REPAIR_POST_PLACE_LABEL, REPAIR_PLACE)];
    },

    assertPass(engine) {
        if (engine.gameTime < REPAIR_GONE_BY) return false;
        return engine.state.fieldObjects.placedDeployables.length === 0
            && damageTaken(engine, playerUnitId(engine)) === REPAIR_WOUND - REPAIR_POST_PULSES * REPAIR_POST_HEAL
            && damageTaken(engine, REPAIR_DUMMY_ID) === REPAIR_WOUND;
    },

    failureMessage(engine) {
        return [
            `t=${engine.gameTime.toFixed(2)}s`,
            `deployables=${engine.state.fieldObjects.placedDeployables.length}`,
            `playerMissing=${damageTaken(engine, playerUnitId(engine))} (want ${REPAIR_WOUND - REPAIR_POST_PULSES * REPAIR_POST_HEAL})`,
            `dummyMissing=${damageTaken(engine, REPAIR_DUMMY_ID)} (want ${REPAIR_WOUND})`,
        ].join('; ');
    },
};

// ---------------------------------------------------------------------------
// armory_mace_whirl_echo
// ---------------------------------------------------------------------------

const WHIRL_PLAYER = cellCentre(3, 3);
/** Where re-casting Create Mace tosses the held mace: the default discard arc from the caster. */
const WHIRL_TOKEN = {
    x: WHIRL_PLAYER.x + Math.cos(DROPPED_WEAPON_ARC_ANGLE) * DROPPED_WEAPON_ARC_DISTANCE,
    y: WHIRL_PLAYER.y + Math.sin(DROPPED_WEAPON_ARC_ANGLE) * DROPPED_WEAPON_ARC_DISTANCE,
};
const WHIRL_NEAR_DUMMY_ID = 'armory_whirl_near_dummy';
/** Inside the caster's ring, far from the token. */
const WHIRL_NEAR_DUMMY = { x: WHIRL_PLAYER.x - CELL_SIZE, y: WHIRL_PLAYER.y };
const WHIRL_TOKEN_DUMMY_ID = 'armory_whirl_token_dummy';
/** Beside the dropped mace, out of the caster's own ring: only the echo reaches it. */
const WHIRL_TOKEN_DUMMY = { x: WHIRL_TOKEN.x + CELL_SIZE * 1.1, y: WHIRL_TOKEN.y };
const RECONJURE_AT = CREATE_SWORD_CAST_DURATION + ORDER_GAP;
const WHIRL_AT = RECONJURE_AT + CREATE_SWORD_CAST_DURATION + ORDER_GAP;
const WHIRL_CHECK_AT = WHIRL_AT + MACE_WHIRL_SWEEP_END + 0.4;
const WHIRL_KEEP_ALIVE_AT = WHIRL_CHECK_AT + 0.5;

function whirlProblem(engine: GameEngine): string | null {
    const near = damageTaken(engine, WHIRL_NEAR_DUMMY_ID);
    if (near !== WHIRL_DAMAGE) return `near dummy took ${near} (want ${WHIRL_DAMAGE})`;
    const byToken = damageTaken(engine, WHIRL_TOKEN_DUMMY_ID);
    if (byToken !== WHIRL_DAMAGE) return `token dummy took ${byToken} (want ${WHIRL_DAMAGE} from the echo)`;
    const maces = engine.state.fieldObjects.droppedWeapons.filter((weapon) => weapon.kind === DROPPED_WEAPON_KIND_MACE);
    if (maces.length !== 1) return `${maces.length} mace tokens (want 1: the echoed one destroyed, the whirl's own dropped)`;
    return null;
}

export const armoryMaceWhirlEchoScenario: ScenarioDefinition = {
    id: 'armory_mace_whirl_echo',
    title: 'Armory: Whirl sweeps around the caster and echoes around a dropped mace, destroying it',
    category: 'ability',
    maxDurationMs: Math.ceil((WHIRL_KEEP_ALIVE_AT + 1) * 1000),

    buildEngine() {
        const engine = buildArmoryEngine(8, 8, WHIRL_PLAYER, [ARMORY_NODE_CORE, ARMORY_NODE_CREATE_MACE]);
        const me = playerUnitId(engine);
        placeTargetDummy(engine, WHIRL_NEAR_DUMMY, WHIRL_NEAR_DUMMY_ID);
        placeTargetDummy(engine, WHIRL_TOKEN_DUMMY, WHIRL_TOKEN_DUMMY_ID);
        engine.state.orderMgr.queueOrder(toTick(RECONJURE_AT), { unitId: me, abilityId: CREATE_MACE_ABILITY_ID, targets: [] });
        engine.state.orderMgr.queueOrder(
            toTick(WHIRL_AT),
            aimedOrder(me, WHIRL_ABILITY_ID, WHIRL_TARGET_LABEL, WHIRL_PLAYER),
        );
        engine.state.orderMgr.queueOrder(toTick(WHIRL_KEEP_ALIVE_AT), { unitId: me, abilityId: 'wait', targets: [] });
        return engine;
    },

    getInitialOrders(engine) {
        return [{ unitId: playerUnitId(engine), abilityId: CREATE_MACE_ABILITY_ID, targets: [] }];
    },

    assertPass(engine) {
        if (engine.gameTime < WHIRL_CHECK_AT) return false;
        return whirlProblem(engine) === null;
    },

    failureMessage(engine) {
        return `t=${engine.gameTime.toFixed(2)}s; ${whirlProblem(engine) ?? 'ok'}`;
    },
};

export const ARMORY_SCENARIOS: ScenarioDefinition[] = [
    armorySwordCycleScenario,
    armoryTurretFiresAndExpiresScenario,
    armoryShieldBlockAndBounceScenario,
    armoryRepairPostHealsAlliesScenario,
    armoryMaceWhirlEchoScenario,
];
