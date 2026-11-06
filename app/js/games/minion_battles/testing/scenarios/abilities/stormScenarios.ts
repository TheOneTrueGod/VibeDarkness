/**
 * Storm Core (13xx) - one AbilityTest that plays the whole kit loop through the real order path:
 * Arc Bolt tags an enemy, Static Step darts through another (tagging it and building Static from the
 * distance), Chain Lightning leaps along the line (spending the tags, relaying through a dropped sword
 * to reach a far enemy), then Thunderclap bursts around the caster and throws the step target back.
 *
 * One scenario covers all four cards because each one sets up the next; that interplay is the point.
 * Later casts are pre-queued in `buildEngine()` (see the ability-tests skill).
 */

import type { ScenarioDefinition } from '../../types';
import type { BattleOrder, ResolvedTarget } from '../../../game/types';
import type { GameEngine } from '../../../game/GameEngine';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import {
    STORM_NODE_CORE,
    STORM_NODE_STATIC_STEP,
    STORM_NODE_THUNDERCLAP,
    STORM_TREE_ID,
} from '../../../../../researchTrees/trees/storm';
import { getMarkStacks } from '../../../buffs/MarkBuff';
import { Movement } from '../../../resources/Movement';
import {
    ARC_BOLT_ABILITY_ID,
    CHAIN_LIGHTNING_ABILITY_ID,
    CHAIN_LIGHTNING_COOLDOWN,
    CHAIN_LIGHTNING_WINDUP,
    CONDUCTIVE_MARK_ID,
    STATIC_STEP_ABILITY_ID,
    STATIC_STEP_DURATION,
    THUNDERCLAP_ABILITY_ID,
    THUNDERCLAP_WINDUP,
} from '../../../card_defs/13_storm_core/stormConstants';
import { ARC_BOLT_PROFILE } from '../../../card_defs/13_storm_core/1301_ArcBolt/1301Ability';

const P = TINY_BATTLE_PLAYER_ID;
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

const PLAYER = cellCentre(2, 4);
/** Arc Bolt target, then the first link of the chain. */
const BOLT_DUMMY_ID = 'storm_bolt_dummy';
const BOLT_DUMMY = cellCentre(5, 2);
/** Static Step passes through this one. */
const STEP_DUMMY_ID = 'storm_step_dummy';
const STEP_DUMMY = cellCentre(4, 4);
const STEP_TO = cellCentre(6, 4);
/** Within leap range of the step dummy. */
const LINK_DUMMY_ID = 'storm_link_dummy';
const LINK_DUMMY = cellCentre(8, 3);
/** Out of leap range of everyone: only the dropped sword between them carries the bolt there. */
const FAR_DUMMY_ID = 'storm_far_dummy';
const FAR_DUMMY = cellCentre(14, 3);
const SWORD_TOKEN = cellCentre(11, 3);

const STEP_AT = ARC_BOLT_PROFILE.cooldownEnd + ORDER_GAP;
const CHAIN_AT = STEP_AT + STATIC_STEP_DURATION + ORDER_GAP;
const CLAP_AT = CHAIN_AT + CHAIN_LIGHTNING_WINDUP + 0.05 + CHAIN_LIGHTNING_COOLDOWN + ORDER_GAP;
const CHECK_AT = CLAP_AT + THUNDERCLAP_WINDUP + 0.3;
const KEEP_ALIVE_AT = CHECK_AT + 0.5;

/** Static the scenario tops the player up to, so every Static cost in the loop can be paid. */
const DEMO_STATIC = 6;

function damageTaken(engine: GameEngine, unitId: string): number {
    const unit = engine.getUnit(unitId);
    return unit ? unit.maxHp - unit.hp : 0;
}

interface KitProgress {
    boltTagged: boolean;
    stepTagged: boolean;
    /** Static and the step target's x just before the clap. */
    staticBeforeClap?: number;
    stepDummyXBeforeClap?: number;
}

/** Hits recorded when each cast lands, so later casts (Chain spends tags) do not erase the evidence. */
const progress = new WeakMap<GameEngine, KitProgress>();

function staticOf(engine: GameEngine): number {
    return engine.getLocalPlayerUnit()?.getResource('static')?.current ?? -1;
}

function kitProblem(engine: GameEngine): string | null {
    const p = progress.get(engine) ?? { boltTagged: false, stepTagged: false };
    if (!p.boltTagged) return 'Arc Bolt never left its target Conductive';
    if (!p.stepTagged) return 'Static Step never left the enemy it passed Conductive';
    for (const id of [BOLT_DUMMY_ID, STEP_DUMMY_ID, LINK_DUMMY_ID]) {
        if (damageTaken(engine, id) <= 0) return `${id} took no damage`;
    }
    if (damageTaken(engine, FAR_DUMMY_ID) <= 0) return 'the bolt never relayed through the sword to the far enemy';
    if (p.staticBeforeClap === undefined || staticOf(engine) >= p.staticBeforeClap) return 'Thunderclap spent no Static';
    const stepDummyX = engine.getUnit(STEP_DUMMY_ID)?.x ?? 0;
    if (p.stepDummyXBeforeClap === undefined || Math.abs(stepDummyX - p.stepDummyXBeforeClap) < 1) {
        return 'Thunderclap did not throw the step target back';
    }
    return null;
}

export const stormKitScenario: ScenarioDefinition = {
    id: 'storm_kit_cycle',
    title: 'Storm: Arc Bolt and Static Step tag, Chain Lightning leaps (through a sword), Thunderclap bursts',
    category: 'ability',
    maxDurationMs: Math.ceil((KEEP_ALIVE_AT + 1) * 1000),

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 17, gridH: 8, localPlayerId: P, grass: true });
        const { player } = placePlayerFromLoadout(engine, {
            playerId: P,
            world: PLAYER,
            equipment: [CORE_ITEM_IDS.StormCore],
            researchTrees: { [STORM_TREE_ID]: [STORM_NODE_CORE, STORM_NODE_STATIC_STEP, STORM_NODE_THUNDERCLAP] },
        });
        // Missions give every player Movement Points (BaseMissionDef); the harness does not. Static Step spends one.
        player.attachResource(new Movement(), engine.eventBus);
        player.getResource('static')!.current = DEMO_STATIC;
        for (const [id, at] of [
            [BOLT_DUMMY_ID, BOLT_DUMMY],
            [STEP_DUMMY_ID, STEP_DUMMY],
            [LINK_DUMMY_ID, LINK_DUMMY],
            [FAR_DUMMY_ID, FAR_DUMMY],
        ] as const) {
            placeTargetDummy(engine, at, id);
        }
        // An Armory sword token lying between the link and the far enemy: metal carries the bolt.
        engine.state.fieldObjects.droppedWeapons.push({
            id: 'storm_scenario_sword',
            x: SWORD_TOKEN.x,
            y: SWORD_TOKEN.y,
            kind: 'sword',
            ownerUnitId: player.id,
            teamId: player.teamId,
            abilityId: '1002',
            spawnedAtGameTime: 0,
            facing: 0,
        });

        const me = player.id;
        const order = (abilityId: string, targets: ResolvedTarget[], label?: string): BattleOrder => ({
            unitId: me,
            abilityId,
            targets,
            ...(label ? { targetsByLabel: { [label]: targets[0]! } } : {}),
        });
        engine.state.orderMgr.queueOrder(toTick(STEP_AT), order(STATIC_STEP_ABILITY_ID, [pixel(STEP_TO)], 'Step to'));
        engine.state.orderMgr.queueOrder(
            toTick(CHAIN_AT),
            order(CHAIN_LIGHTNING_ABILITY_ID, [{ type: 'unit', unitId: STEP_DUMMY_ID }], 'Enemy'),
        );
        engine.state.orderMgr.queueOrder(toTick(CLAP_AT), order(THUNDERCLAP_ABILITY_ID, [pixel(STEP_TO)], 'Release'));
        engine.state.orderMgr.queueOrder(toTick(KEEP_ALIVE_AT), { unitId: me, abilityId: 'wait', targets: [] });
        return engine;
    },

    getInitialOrders(engine) {
        const me = engine.getLocalPlayerUnit()!.id;
        return [{ unitId: me, abilityId: ARC_BOLT_ABILITY_ID, targets: [pixel(BOLT_DUMMY)], targetsByLabel: { 'Target location': pixel(BOLT_DUMMY) } }];
    },

    assertPass(engine) {
        const p = progress.get(engine) ?? { boltTagged: false, stepTagged: false };
        const bolt = engine.getUnit(BOLT_DUMMY_ID);
        const stepped = engine.getUnit(STEP_DUMMY_ID);
        if (bolt && getMarkStacks(bolt, CONDUCTIVE_MARK_ID) > 0) p.boltTagged = true;
        if (stepped && getMarkStacks(stepped, CONDUCTIVE_MARK_ID) > 0) p.stepTagged = true;
        // A beat before the order tick: the clap pays its cost on that tick.
        if (engine.gameTime < CLAP_AT - 0.1) {
            p.staticBeforeClap = staticOf(engine);
            p.stepDummyXBeforeClap = stepped?.x;
        }
        progress.set(engine, p);
        if (engine.gameTime < CHECK_AT) return false;
        return kitProblem(engine) === null;
    },

    failureMessage(engine) {
        const dealt = [BOLT_DUMMY_ID, STEP_DUMMY_ID, LINK_DUMMY_ID, FAR_DUMMY_ID]
            .map((id) => `${id}=${damageTaken(engine, id)}`)
            .join(' ');
        return `${kitProblem(engine) ?? 'not finished'} (${dealt})`;
    },
};

export const STORM_SCENARIOS: ScenarioDefinition[] = [stormKitScenario];
