/**
 * Water tree (15xx) high-level AbilityTests through the real order path.
 *
 * - `water_siphon_e2e` — a caster beside deep water gains Water and the tile drops a level.
 * - `ice_claws_swap_e2e` — with both cards, Ice Claws casts for its Water cost, then the same slot casts Bloody Claws.
 * - `ice_claws_ice_only_e2e` — with the Blood mode locked (no owned blood card), the slot stays Ice.
 * - `water_starting_amount_e2e` — the Blood Mage core sets the Water bar (starting amount and max).
 * - `ice_shards_pierce_e2e` — two shards each pass one enemy and stop on the next.
 * - `frozen_field_e2e` — enemies in the field stay stunned and take damage until the field ends.
 *
 * A future wait order stays in `pendingOrders` so the runner does not treat a standing caster
 * (or a ground hazard with no live cast) as battle-idle before the assert can pass.
 */

import type { ScenarioDefinition } from '../../types';
import type { BattleOrder, ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { GameEngine } from '../../../game/GameEngine';
import { FIXED_DT } from '../../../game/gameConstants';
import { STUNNED_BUFF_TYPE } from '../../../buffs/StunnedBuff';
import { CLAW_COMBO_LABELS } from '../../../abilities/clawCombo';
import { DEFAULT_UNIT_RADIUS } from '../../../game/units/unit_defs/unitConstants';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { applyLockedAbilityModes, attachResourcesFromEquipment } from '../../../storylines/BaseMissionDef';
import { getAvailableModes } from '../../../abilities/resolveAbilityMode';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { ResourceId } from '../../../resources/resourceIds';
import { Water, WATER_SIPHON } from '../../../resources/Water';
import { coreBloodMageItem, BLOOD_CORE_WATER_MAX, BLOOD_CORE_WATER_START } from '../../../character_defs/items/core/022_core_blood_mage';
import {
    BLOOD_MAGE_NODE_BURST,
    BLOOD_MAGE_NODE_CLAWS,
    BLOOD_MAGE_NODE_CORE,
    BLOOD_MAGE_NODE_FROZEN_FIELD,
    BLOOD_MAGE_NODE_ICE_CLAWS,
    BLOOD_MAGE_NODE_ICE_SHARDS,
    BLOOD_MAGE_TREE_ID,
} from '../../../../../researchTrees/trees/blood_mage';
import {
    BLOODY_CLAWS_MAX_USES,
    BLOODY_CLAWS_TIMINGS,
    BloodyClawsAbility_0306,
} from '../../../card_defs/03_blood_mage/0306_BloodyClaws/0306Ability';
import {
    ICE_CLAWS_WATER_COST,
    IceClawsAbility_1501,
} from '../../../card_defs/15_water/1501_IceClaws/1501Ability';
import {
    ICE_SHARDS_DAMAGE,
    ICE_SHARDS_PACING,
    ICE_SHARDS_PROJECTILE_SPEED,
    ICE_SHARDS_RANGE,
    IceShardsAbility_1502,
} from '../../../card_defs/15_water/1502_IceShards/1502Ability';
import {
    FROZEN_FIELD_IMPACT_DAMAGE,
    FROZEN_FIELD_LIFETIME_SEC,
    FROZEN_FIELD_PULSE_DAMAGE,
    FROZEN_FIELD_PULSE_EVERY_SEC,
    FROZEN_FIELD_TARGET_LABEL,
    FROZEN_FIELD_TIMINGS,
    FROZEN_FIELD_WATER_COST,
    FrozenFieldAbility_1503,
} from '../../../card_defs/15_water/1503_FrozenField/1503Ability';

const P = TINY_BATTLE_PLAYER_ID;
const EQUIPMENT = [CORE_ITEM_IDS.BloodMageCore];

/** Seconds for one water tile to lose a full level at the siphon's drain rate. */
const WATER_LEVEL_DROP_SEC = 1 / WATER_SIPHON.drainPerTilePerSec;
/** Past the level drop, so assertPass sees the transition. */
const SIPHON_WATCH_SLACK_SEC = 1;

const ICE_ID = IceClawsAbility_1501.id;
const BLOODY_ID = BloodyClawsAbility_0306.id;
const SHARDS_ID = IceShardsAbility_1502.id;
const FIELD_ID = FrozenFieldAbility_1503.id;

const CLAW_AIM_LABELS = [CLAW_COMBO_LABELS.swipeLeft, CLAW_COMBO_LABELS.swipeRight, CLAW_COMBO_LABELS.xStrike];

function cellCentre(col: number, row: number): { x: number; y: number } {
    return { x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
}

function pixel(at: { x: number; y: number }): ResolvedTarget {
    return { type: 'pixel', position: { x: at.x, y: at.y } };
}

function labeledOrder(unitId: string, abilityId: string, labeled: Record<string, ResolvedTarget>): BattleOrder {
    return { unitId, abilityId, targets: Object.values(labeled), targetsByLabel: labeled };
}

function sameAim(labels: readonly string[], at: { x: number; y: number }): Record<string, ResolvedTarget> {
    const labeled: Record<string, ResolvedTarget> = {};
    for (const label of labels) labeled[label] = pixel(at);
    return labeled;
}

/** Stored research with the ice node and every blood node on its path. */
function researchWith(nodeId: string, prereq: string): Record<string, string[]> {
    return { [BLOOD_MAGE_TREE_ID]: [...new Set([BLOOD_MAGE_NODE_CORE, prereq, nodeId])] };
}

function fillWater(player: Unit, amount: number): void {
    const water = player.getResource(ResourceId.Water);
    if (!water) throw new Error('Water scenario: the caster has no Water resource');
    water.add(amount);
}

/** Keeps `isScenarioRunnerBattleIdle` false until `seconds` from now. */
function keepSimRunning(engine: GameEngine, seconds: number): void {
    const player = engine.getLocalPlayerUnit();
    if (!player) throw new Error('Water scenario: no local player');
    engine.state.orderMgr.queueOrder(engine.gameTick + Math.ceil(seconds / FIXED_DT), {
        unitId: player.id,
        abilityId: 'wait',
        targets: [],
    });
}

function buildMageEngine(gridW: number, gridH: number, at: { x: number; y: number }, nodeId: string, prereq: string): GameEngine {
    const engine = buildTinyBattleEngine({ gridW, gridH, localPlayerId: P, grass: true });
    placePlayerFromLoadout(engine, {
        playerId: P,
        world: at,
        equipment: [...EQUIPMENT],
        researchTrees: researchWith(nodeId, prereq),
    });
    return engine;
}

// ---------------------------------------------------------------------------
// Water siphon
// ---------------------------------------------------------------------------

const SIPHON_PLAYER_CELL = { col: 2, row: 2 };
const SIPHON_WATER_CELL = { col: SIPHON_PLAYER_CELL.col + 1, row: SIPHON_PLAYER_CELL.row };

export const waterSiphonScenario: ScenarioDefinition = {
    id: 'water_siphon_e2e',
    title: 'Water siphon: a caster beside deep water gains Water and the tile drops a level',
    category: 'ability',
    maxDurationMs: (WATER_LEVEL_DROP_SEC + SIPHON_WATCH_SLACK_SEC) * 1000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 6, gridH: 6, localPlayerId: P, grass: true });
        const at = cellCentre(SIPHON_PLAYER_CELL.col, SIPHON_PLAYER_CELL.row);
        const player = spawnTinyPlayerUnit(engine, { playerId: P, x: at.x, y: at.y, abilities: [] });
        player.attachResource(new Water(), engine.eventBus);
        engine.terrainManager!.grid.set(SIPHON_WATER_CELL.col, SIPHON_WATER_CELL.row, TerrainType.DeepWater);
        keepSimRunning(engine, WATER_LEVEL_DROP_SEC + SIPHON_WATCH_SLACK_SEC);
        return engine;
    },

    getInitialOrders: () => [],

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        const water = player?.getResource(ResourceId.Water);
        const terrain = engine.terrainManager?.getEffectiveTerrainType(SIPHON_WATER_CELL.col, SIPHON_WATER_CELL.row);
        return (water?.current ?? 0) > 0 && terrain !== TerrainType.DeepWater && terrain != null;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const water = player?.getResource(ResourceId.Water)?.current ?? 0;
        const terrain = engine.terrainManager?.getEffectiveTerrainType(SIPHON_WATER_CELL.col, SIPHON_WATER_CELL.row);
        return `water=${water} (want > 0); tile=${terrain} (want not DeepWater ${TerrainType.DeepWater}); t=${engine.gameTime.toFixed(2)}`;
    },
};

// ---------------------------------------------------------------------------
// Ice Claws: Ice / Blood modes
// ---------------------------------------------------------------------------

const CLAW_CASTER = { x: 200, y: 200 };
const CLAW_AIM = { x: CLAW_CASTER.x + CELL_SIZE, y: CLAW_CASTER.y };
/** After the first cast's cooldown, with a couple of ticks of slack. */
const CLAW_SECOND_CAST_TICK = Math.ceil(BLOODY_CLAWS_TIMINGS.cooldownEnd / FIXED_DT) + 2;
const CLAW_WATCH_SEC = BLOODY_CLAWS_TIMINGS.cooldownEnd * 2 + SIPHON_WATCH_SLACK_SEC;

/** Both casts are plain orders on the Ice slot (no `abilityMode`): the engine resolves the mode at cast time. */
function queueSecondClawCast(engine: GameEngine, player: Unit): void {
    engine.state.orderMgr.queueOrder(
        CLAW_SECOND_CAST_TICK,
        labeledOrder(player.id, ICE_ID, sameAim(CLAW_AIM_LABELS, CLAW_AIM)),
    );
}

export const iceClawsSwapScenario: ScenarioDefinition = {
    id: 'ice_claws_swap_e2e',
    title: 'Ice Claws (1501): casts Ice for its Water cost, then the same slot casts Bloody Claws',
    category: 'ability',
    maxDurationMs: CLAW_WATCH_SEC * 1000,

    buildEngine() {
        const engine = buildMageEngine(12, 8, CLAW_CASTER, BLOOD_MAGE_NODE_ICE_CLAWS, BLOOD_MAGE_NODE_CLAWS);
        const player = engine.getLocalPlayerUnit()!;
        // Set to 5 Water: one Ice cast (3) leaves 2, below the cost, so the second order falls back to Blood.
        player.getResource(ResourceId.Water)!.current = FALLBACK_START_WATER;
        queueSecondClawCast(engine, player);
        keepSimRunning(engine, CLAW_WATCH_SEC);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [labeledOrder(player.id, ICE_ID, sameAim(CLAW_AIM_LABELS, CLAW_AIM))];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        const water = player.getResource(ResourceId.Water)?.current;
        return engine.gameTick > CLAW_SECOND_CAST_TICK
            && water === FALLBACK_START_WATER - ICE_CLAWS_WATER_COST
            && player.abilityRuntime[BLOODY_ID]?.currentUses === BLOODY_CLAWS_MAX_USES - 1
            && player.hp < player.maxHp
            && player.activeAbilities.length === 0;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const water = player?.getResource(ResourceId.Water)?.current;
        return `water=${water} (want ${FALLBACK_START_WATER - ICE_CLAWS_WATER_COST}); hp=${player?.hp}/${player?.maxHp} (want < max: Blood paid HP) bloody uses=${player?.abilityRuntime[BLOODY_ID]?.currentUses}; casting=${player?.activeAbilities.map((a) => a.abilityId).join(',') || 'none'}; tick=${engine.gameTick}`;
    },
};

// Why a second Ice Claws scenario: the first proves the Blood fallback; this one proves a unit that never owned the
// blood card has no Blood mode to fall back to (the slot stays Ice and simply cannot cast).
export const iceClawsIceOnlyScenario: ScenarioDefinition = {
    id: 'ice_claws_ice_only_e2e',
    title: 'Ice Claws (1501): with the Blood mode locked, the slot stays Ice and does not cast Bloody Claws',
    category: 'ability',
    maxDurationMs: CLAW_WATCH_SEC * 1000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 12, gridH: 8, localPlayerId: P, grass: true });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: CLAW_CASTER.x,
            y: CLAW_CASTER.y,
            abilities: [ICE_ID],
        });
        // The tiny-battle spawn skips these two spawn steps (placePlayerFromLoadout does them).
        attachResourcesFromEquipment([coreBloodMageItem.id], player, engine.eventBus);
        player.getResource(ResourceId.Water)!.current = FALLBACK_START_WATER;
        applyLockedAbilityModes(player, { abilityIds: [ICE_ID], replacedCardIds: [] });
        queueSecondClawCast(engine, player);
        keepSimRunning(engine, CLAW_WATCH_SEC);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [labeledOrder(player.id, ICE_ID, sameAim(CLAW_AIM_LABELS, CLAW_AIM))];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player) return false;
        const water = player.getResource(ResourceId.Water)?.current;
        return engine.gameTick > CLAW_SECOND_CAST_TICK
            && getAvailableModes(player, IceClawsAbility_1501).join() === 'ice'
            && water === FALLBACK_START_WATER - ICE_CLAWS_WATER_COST
            && player.hp === player.maxHp
            && player.activeAbilities.length === 0;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        return `modes=${player ? getAvailableModes(player, IceClawsAbility_1501).join() : 'none'} (want ice); water=${player?.getResource(ResourceId.Water)?.current} (want ${FALLBACK_START_WATER - ICE_CLAWS_WATER_COST}); hp=${player?.hp}/${player?.maxHp} (want full); tick=${engine.gameTick}`;
    },
};

// ---------------------------------------------------------------------------
// Starting Water
// ---------------------------------------------------------------------------

/** Water the fallback scenarios start at, so one Ice Claws cast (3) leaves less than the cost. */
const FALLBACK_START_WATER = 5;

export const waterStartingAmountScenario: ScenarioDefinition = {
    id: 'water_starting_amount_e2e',
    title: 'Water: the Blood Mage core sets the Water bar (starts at its starting amount, max from the core)',
    category: 'ability',
    maxDurationMs: 1000,

    buildEngine() {
        const engine = buildMageEngine(12, 8, CLAW_CASTER, BLOOD_MAGE_NODE_ICE_CLAWS, BLOOD_MAGE_NODE_CLAWS);
        keepSimRunning(engine, 1);
        return engine;
    },

    getInitialOrders: () => [],

    assertPass(engine) {
        const water = engine.getLocalPlayerUnit()?.getResource(ResourceId.Water);
        return water?.current === BLOOD_CORE_WATER_START && water.max === BLOOD_CORE_WATER_MAX;
    },

    failureMessage(engine) {
        const water = engine.getLocalPlayerUnit()?.getResource(ResourceId.Water);
        return `water=${water?.current}/${water?.max} (want ${BLOOD_CORE_WATER_START}/${BLOOD_CORE_WATER_MAX})`;
    },
};

// ---------------------------------------------------------------------------
// Ice Shards pierce
// ---------------------------------------------------------------------------

const SHARD_CASTER = { x: 120, y: 200 };
const SHARD_LINE = [
    { id: 'shard_first', at: { x: SHARD_CASTER.x + DEFAULT_UNIT_RADIUS * 3, y: SHARD_CASTER.y } },
    { id: 'shard_second', at: { x: SHARD_CASTER.x + DEFAULT_UNIT_RADIUS * 6, y: SHARD_CASTER.y } },
    { id: 'shard_third', at: { x: SHARD_CASTER.x + ICE_SHARDS_RANGE - DEFAULT_UNIT_RADIUS, y: SHARD_CASTER.y } },
] as const;
const SHARD_AIM = { x: SHARD_CASTER.x + ICE_SHARDS_RANGE, y: SHARD_CASTER.y };
const SHARD_FLIGHT_SEC = ICE_SHARDS_RANGE / ICE_SHARDS_PROJECTILE_SPEED;

function shardLoss(unit: Unit | undefined): number {
    if (!unit) return 0;
    return unit.maxHp - unit.hp;
}

export const iceShardsPierceScenario: ScenarioDefinition = {
    id: 'ice_shards_pierce_e2e',
    title: 'Ice Shards (1502): two shards each pass one enemy and stop on the next',
    category: 'ability',
    maxDurationMs: (ICE_SHARDS_PACING.totalDuration + SHARD_FLIGHT_SEC + SIPHON_WATCH_SLACK_SEC) * 1000,

    buildEngine() {
        const engine = buildMageEngine(16, 10, SHARD_CASTER, BLOOD_MAGE_NODE_ICE_SHARDS, BLOOD_MAGE_NODE_CORE);
        for (const enemy of SHARD_LINE) placeTargetDummy(engine, enemy.at, enemy.id);
        keepSimRunning(engine, ICE_SHARDS_PACING.totalDuration + SHARD_FLIGHT_SEC + SIPHON_WATCH_SLACK_SEC);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const labels = IceShardsAbility_1502.targets.map((target) => target.label);
        return [labeledOrder(player.id, SHARDS_ID, sameAim(labels, SHARD_AIM))];
    },

    assertPass(engine) {
        const first = engine.getUnit(SHARD_LINE[0].id);
        const second = engine.getUnit(SHARD_LINE[1].id);
        const third = engine.getUnit(SHARD_LINE[2].id);
        const perShard = ICE_SHARDS_DAMAGE;
        return shardLoss(first) === perShard * 2
            && shardLoss(second) === perShard * 2
            && shardLoss(third) === 0;
    },

    failureMessage(engine) {
        const lines = SHARD_LINE.map((enemy) => `${enemy.id}=${shardLoss(engine.getUnit(enemy.id))}`);
        return `${lines.join(', ')} (want ${ICE_SHARDS_DAMAGE * 2}, ${ICE_SHARDS_DAMAGE * 2}, 0)`;
    },
};

// ---------------------------------------------------------------------------
// Frozen Field
// ---------------------------------------------------------------------------

const FIELD_CASTER = { x: 200, y: 200 };
const FIELD_AIM = { x: FIELD_CASTER.x + CELL_SIZE * 2, y: FIELD_CASTER.y };
const FIELD_INSIDE_ID = 'field_inside';
const FIELD_OUTSIDE_ID = 'field_outside';
const FIELD_END_SEC = FROZEN_FIELD_TIMINGS.impactAt + FROZEN_FIELD_LIFETIME_SEC;
/** Still inside the last pulse window: stunned, and past a single impact hit. */
const FIELD_CHECK_SEC = FIELD_END_SEC - FROZEN_FIELD_PULSE_EVERY_SEC;
const FIELD_PULSE_COUNT = FROZEN_FIELD_LIFETIME_SEC / FROZEN_FIELD_PULSE_EVERY_SEC;
const FIELD_MIN_LOSS = FROZEN_FIELD_IMPACT_DAMAGE + FROZEN_FIELD_PULSE_DAMAGE * (FIELD_PULSE_COUNT / 2);

export const frozenFieldScenario: ScenarioDefinition = {
    id: 'frozen_field_e2e',
    title: 'Frozen Field (1503): enemies in the field stay stunned and take damage until it ends',
    category: 'ability',
    maxDurationMs: (FIELD_END_SEC + SIPHON_WATCH_SLACK_SEC) * 1000,

    buildEngine() {
        const engine = buildMageEngine(16, 12, FIELD_CASTER, BLOOD_MAGE_NODE_FROZEN_FIELD, BLOOD_MAGE_NODE_BURST);
        fillWater(engine.getLocalPlayerUnit()!, FROZEN_FIELD_WATER_COST);
        placeTargetDummy(engine, FIELD_AIM, FIELD_INSIDE_ID);
        placeTargetDummy(engine, { x: FIELD_CASTER.x, y: FIELD_CASTER.y - CELL_SIZE * 4 }, FIELD_OUTSIDE_ID);
        keepSimRunning(engine, FIELD_END_SEC + SIPHON_WATCH_SLACK_SEC);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [labeledOrder(player.id, FIELD_ID, { [FROZEN_FIELD_TARGET_LABEL]: pixel(FIELD_AIM) })];
    },

    assertPass(engine) {
        const inside = engine.getUnit(FIELD_INSIDE_ID);
        const outside = engine.getUnit(FIELD_OUTSIDE_ID);
        if (!inside || !outside) return false;
        const loss = inside.maxHp - inside.hp;
        return engine.gameTime >= FIELD_CHECK_SEC
            && loss >= FIELD_MIN_LOSS
            && inside.hasBuff(STUNNED_BUFF_TYPE)
            && outside.hp === outside.maxHp;
    },

    failureMessage(engine) {
        const inside = engine.getUnit(FIELD_INSIDE_ID);
        const outside = engine.getUnit(FIELD_OUTSIDE_ID);
        const loss = inside ? inside.maxHp - inside.hp : 0;
        return `t=${engine.gameTime.toFixed(2)} (want >= ${FIELD_CHECK_SEC}); inside loss=${loss} (want >= ${FIELD_MIN_LOSS}) stunned=${inside?.hasBuff(STUNNED_BUFF_TYPE)}; outside hp=${outside?.hp}/${outside?.maxHp}`;
    },
};

export const WATER_SCENARIOS: ScenarioDefinition[] = [
    waterSiphonScenario,
    iceClawsSwapScenario,
    iceClawsIceOnlyScenario,
    waterStartingAmountScenario,
    iceShardsPierceScenario,
    frozenFieldScenario,
];
