/**
 * Garden Heart boss: high-level, deterministic scenarios for the Shell, the phase retreat, the destructible seed, the
 * seed burrowing out from its Pod Mortar (and outliving it) and
 * Reactions (single player and the co-op claim). Assertions are about behaviour, not tuned numbers; the one exception
 * is the Shell rule (25 -> 15), which is a design rule.
 *
 * Harness notes:
 * - The runner auto-answers every order pause with `wait`, so scenarios that need a real reaction decision build the
 *   engine up to the reaction pause themselves and hand the real order(s) back through `getInitialOrders`.
 * - Scripted world events (hits at a given tick) run from a small driver called at the top of `assertPass`; it is
 *   idempotent per stage because the runner calls `assertPass` more than once per tick.
 * - A far-future `wait` order is queued to keep the runner from treating a quiet battle as idle.
 * - The co-op claim is applied engine-side (`applyReactionClaim`); the mesh/host round trip is not expressible in the
 *   headless harness and is covered by `game/battlenet/reactionClaimController.test.ts`.
 */
import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import type { EnemySpawnDef, LevelEvent, LevelEventContinuousSpawn } from '../../../storylines/types';
import type { DamageTakenEvent } from '../../../game/EventBus';
import { createUnitFromSpawnConfig } from '../../../game/units';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { GameEngine as GameEngineClass } from '../../../game/GameEngine';
import {
    ENEMY_DARK_WOLF,
    ENEMY_GARDEN_HEART,
    ENEMY_GLOAM_LILY,
    ENEMY_MENDER_BLOOM,
    ENEMY_POD_MORTAR,
    ENEMY_THORNSPITTER,
} from '../../../constants/enemyConstants';
import { getNodeRegrowthStatus } from '../../../game/units/components/nodeRegrowth';
import { darkShare } from '../../../game/lighting/darkShare';
import { getNodeChildIds, hasLivingChildren, linkNodeChild } from '../../../game/units/components/nodeTree';
import { peekFusedBodyState } from '../../../game/units/components/fusedBodyComponent';
import { spawnFusedBody } from '../../../game/units/components/fusedBodySpawn';
import { peekPhaseState } from '../../../game/units/components/phaseComponent';
import { gardenTreeLayout } from '../../../game/gardenHeart/gardenTreeLayouts';
import { gardenTreeDescendants, growGardenTree, type GardenGrowContext } from '../../../game/gardenHeart/growGardenTree';
import { GARDEN_PHASE_SPROUT_POINTS } from '../../../card_defs/16_enemy_garden_heart/gardenHeartPhases';
import { attachReflexIfKnown } from '../../../resources/Reflex';
import { ResourceId } from '../../../resources/resourceIds';
import { applyReactionClaim } from '../../../game/reactions/claimRule';
import { KNOWLEDGE_REACTIONS } from '../../../../../accountKnowledge';
import { registerWorldOfDarknessSegments } from '../../../storylines/WorldOfDarkness/registerSegments';
import { GARDEN_DARKNESS_SPAWN, GARDEN_HEART } from '../../../storylines/WorldOfDarkness/missions/020_garden_heart';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { grantAbilityUses } from '../../../abilities/abilityUses';
import { BURROWING_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/burrowingDef';
import {
    GARDEN_HEART_HEALTH_POOLS,
    LOB_SEED_ABILITY_ID,
    PINWHEEL_ABILITY_ID,
    SPIKE_RING_ABILITY_ID,
} from '../../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { ROUND_DURATION } from '../../../game/gameConstants';
import '../../../abilities/AbilityRegistry';

const SECTION = 'Garden Heart';
/** Share of the Heart's max HP left when phase 2 is entered (the later phases' health pools). */
const GARDEN_HEART_RETREAT_FRACTION_2 =
    GARDEN_HEART_HEALTH_POOLS.slice(1).reduce((a, b) => a + b, 0) / GARDEN_HEART_HEALTH_POOLS.reduce((a, b) => a + b, 0);
const P1 = TINY_BATTLE_PLAYER_ID;
const P2 = 'tiny_p2';
const TPS = 60;
const REACT_ABILITY = '0104';
const cell = (n: number): number => n * CELL_SIZE + CELL_SIZE / 2;
const holdOpen = (engine: GameEngine, unit: Unit, seconds: number): void => {
    engine.state.orderMgr.queueOrder(Math.round(seconds * TPS), { unitId: unit.id, abilityId: 'wait', targets: [] });
};

function addEnemy(engine: GameEngine, def: EnemySpawnDef, x: number, y: number): Unit {
    const u = createUnitFromSpawnConfig({ ...def, x, y, ownerId: 'ai', unitAITreeId: 'none' }, engine.eventBus, engine);
    engine.addUnit(u, 'initialGameSpawn');
    return u;
}

// ---------------------------------------------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------------------------------------------

interface ShellRun {
    knot: Unit;
    bud: Unit;
    hits: Array<{ lost: number; resisted: number; shelled: boolean }>;
    stage: number;
}
const shellRuns = new WeakMap<GameEngine, ShellRun>();

function hitKnot(engine: GameEngine, run: ShellRun, amount: number): void {
    const before = run.knot.hp;
    const shelled = hasLivingChildren(run.knot);
    let resisted = 0;
    const listener = (e: DamageTakenEvent): void => {
        if (e.unitId === run.knot.id) resisted = e.resisted ?? 0;
    };
    engine.eventBus.on('damage_taken', listener);
    run.knot.takeDamage(amount, 'tester', engine.eventBus);
    engine.eventBus.off('damage_taken', listener);
    run.hits.push({ lost: before - run.knot.hp, resisted, shelled });
}

function driveShell(engine: GameEngine): ShellRun {
    const run = shellRuns.get(engine)!;
    if (run.stage === 0) {
        hitKnot(engine, run, 25); // shelled
        run.stage = 1;
    }
    if (run.stage === 1 && engine.gameTick >= 30) {
        run.bud.takeDamage(run.bud.maxHp * 10, 'tester', engine.eventBus); // kills the Bud: the Shell opens
        run.stage = 2;
    }
    if (run.stage === 2 && engine.gameTick >= 60) {
        hitKnot(engine, run, 25); // open
        run.stage = 3;
    }
    return run;
}

export const gardenHeartShellScenario: ScenarioDefinition = {
    id: 'garden_heart_shell',
    title: 'Garden Heart: a shelled Knot resists hits; killing its Bud opens it',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 3000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 10, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(2), y: cell(5), abilities: [] });
        const knot = addEnemy(engine, ENEMY_THORNSPITTER, cell(8), cell(5));
        const bud = addEnemy(engine, ENEMY_POD_MORTAR, cell(12), cell(5));
        linkNodeChild(knot, bud);
        knot.hp = knot.maxHp = 1000; // survives the scripted hits
        shellRuns.set(engine, { knot, bud, hits: [], stage: 0 });
        holdOpen(engine, player, 2.5);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = driveShell(engine);
        if (run.hits.length < 2) return false;
        const [first, second] = run.hits;
        return (
            first!.shelled &&
            first!.lost === 15 && // design rule: 25 -> 15 while shelled
            first!.resisted === 10 &&
            !second!.shelled &&
            second!.lost === 25 &&
            second!.resisted === 0
        );
    },
    failureMessage(engine) {
        const run = shellRuns.get(engine);
        return `Shell hits: ${JSON.stringify(run?.hits)}`;
    },
};

// ---------------------------------------------------------------------------------------------------------------
// Phase retreat (the real mission, so sprout points, Briar and tree layouts are the shipped ones)
// ---------------------------------------------------------------------------------------------------------------

interface RetreatRun {
    heart: Unit;
    oldTree: Unit[];
    briarBefore: number;
    maxHp: number;
    sawBurrow: boolean;
}
const retreatRuns = new WeakMap<GameEngine, RetreatRun>();

function countBriar(engine: GameEngine): number {
    const tm = engine.terrainManager!;
    let n = 0;
    for (let row = 0; row < tm.grid.height; row++) {
        for (let col = 0; col < tm.grid.width; col++) {
            if (tm.getEffectiveTerrainType(col, row) === TerrainType.Briar) n++;
        }
    }
    return n;
}

/** The real Garden Heart mission, one near-unkillable player: sprout points, Briar and tree layouts are the shipped ones. */
function buildGardenMissionEngine(): { engine: GameEngine; heart: Unit; player: Unit } {
    registerWorldOfDarknessSegments();
    resetGameObjectIdCounter(1);
    const mission = GARDEN_HEART;
    const engine = new GameEngineClass();
    const terrainManager = new TerrainManager(mission.createTerrain());
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 7, terrainManager });
    const composed = mission.composeMap();
    mission.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    engine.registerBattleObjectives(mission.battleObjectives ?? []);
    const heart = engine.units.find((u) => u.characterId === 'garden_heart')!;
    const player = engine.getLocalPlayerUnit()!;
    player.hp = player.maxHp = 100000; // the eruptions and thorns must not end the scenario
    return { engine, heart, player };
}

export const gardenHeartPhaseRetreatScenario: ScenarioDefinition = {
    id: 'garden_heart_phase_retreat',
    title: 'Garden Heart: a big hit that empties the first health pool retreats, old tree becomes Briar, Heart resurfaces with the phase-2 tree',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 16000,
    buildEngine() {
        const { engine, heart, player } = buildGardenMissionEngine();
        const run: RetreatRun = {
            heart,
            oldTree: engine.units.filter((u) => u.id !== heart.id && u.teamId === heart.teamId),
            briarBefore: countBriar(engine),
            maxHp: heart.maxHp,
            sawBurrow: false,
        };
        retreatRuns.set(engine, run);
        heart.takeDamage(heart.maxHp * 5, player.id, engine.eventBus); // far past 75%: the hit is clamped
        holdOpen(engine, player, 15);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = retreatRuns.get(engine)!;
        const { heart } = run;
        const burrow = peekPhaseState(heart)?.burrow;
        if (burrow) {
            run.sawBurrow = true;
            return false;
        }
        if (!run.sawBurrow) return false;
        const phase2 = gardenTreeLayout(2)!;
        const fresh = engine.units.filter((u) => u.isAlive() && u.teamId === heart.teamId && u.id !== heart.id);
        return (
            Math.abs(heart.hp - run.maxHp * GARDEN_HEART_RETREAT_FRACTION_2) < 1e-6 && // damage past the threshold is lost
            run.oldTree.every((u) => !u.isAlive()) &&
            countBriar(engine) > run.briarBefore &&
            GARDEN_PHASE_SPROUT_POINTS[2].some((p) => p.x === heart.x && p.y === heart.y) &&
            fresh.length === phase2.length &&
            getNodeChildIds(heart).length === phase2.filter((s) => s.parent === null).length &&
            fresh.every((u) => !run.oldTree.includes(u))
        );
    },
    failureMessage(engine) {
        const run = retreatRuns.get(engine);
        if (!run) return 'no run';
        return `sawBurrow=${run.sawBurrow} heartHp=${run.heart.hp}/${run.maxHp} oldTreeDead=${run.oldTree.every((u) => !u.isAlive())} briar=${countBriar(engine)}/${run.briarBefore}`;
    },
};

// ---------------------------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------------------------

interface SeedRun {
    seed: Unit;
    player: Unit;
    killed: boolean;
}
const seedRuns = new WeakMap<GameEngine, SeedRun>();

export const gardenHeartSeedDestroyedScenario: ScenarioDefinition = {
    id: 'garden_heart_seed_destroyed',
    title: 'Garden Heart: a destroyed Pod Mortar seed does not burst',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 9000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 10, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(8), y: cell(5), abilities: [] });
        const seed = spawnFusedBody(engine, { characterId: 'pod_seed', x: cell(8), y: cell(5), unitId: 'seed' })!;
        seedRuns.set(engine, { seed, player, killed: false });
        holdOpen(engine, player, 8);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = seedRuns.get(engine)!;
        if (!run.killed && engine.gameTick >= 2 * TPS) {
            run.seed.takeDamage(run.seed.maxHp, run.player.id, engine.eventBus); // well before the telegraph
            run.killed = true;
        }
        // Wait out the whole fuse: the burst would have landed by now.
        return (
            run.killed &&
            engine.gameTick >= 7 * TPS &&
            peekFusedBodyState(run.seed)?.outcome === 'killed' &&
            !run.seed.isAlive() &&
            run.player.hp === run.player.maxHp
        );
    },
    failureMessage(engine) {
        const run = seedRuns.get(engine);
        return `outcome=${run ? peekFusedBodyState(run.seed)?.outcome : '?'} playerHp=${run?.player.hp}/${run?.player.maxHp}`;
    },
};

interface GrowthRun {
    mortar: Unit;
    player: Unit;
    cast: boolean;
    sawBurrow: boolean;
    killedMortar: boolean;
}
const growthRuns = new WeakMap<GameEngine, GrowthRun>();
const seedsOf = (engine: GameEngine): Unit[] => engine.units.filter((u) => u.characterId === 'pod_seed');

export const gardenHeartSeedGrowthScenario: ScenarioDefinition = {
    id: 'garden_heart_seed_growth',
    title: 'Garden Heart: a Pod Mortar seed burrows out and still surfaces after the mortar dies',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 6000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 10, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        // 8 tiles apart: inside Lob Seed's range, so the seed surfaces under the player.
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(10), y: cell(5), abilities: [] });
        const mortar = addEnemy(engine, ENEMY_POD_MORTAR, cell(2), cell(5));
        growthRuns.set(engine, { mortar, player, cast: false, sawBurrow: false, killedMortar: false });
        holdOpen(engine, player, 5);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = growthRuns.get(engine)!;
        if (!run.cast && engine.gameTick >= 2) {
            executeUnitAbility(run.mortar, getAbility(LOB_SEED_ABILITY_ID)!, [
                { type: 'pixel', position: { x: run.player.x, y: run.player.y } },
            ], engine);
            run.cast = true;
        }
        const burrowing = engine.projectiles.some((p) => p.projectileType === BURROWING_PROJECTILE_TYPE);
        if (burrowing && seedsOf(engine).length === 0) run.sawBurrow = true;
        // Kill the mortar while its seed is still underground.
        if (run.sawBurrow && !run.killedMortar) {
            run.mortar.takeDamage(run.mortar.maxHp * 10, run.player.id, engine.eventBus);
            run.killedMortar = true;
        }
        const seed = seedsOf(engine)[0];
        return (
            run.killedMortar &&
            !run.mortar.isAlive() &&
            !!seed &&
            seed.teamId === run.mortar.teamId &&
            Math.hypot(seed.x - run.player.x, seed.y - run.player.y) < CELL_SIZE
        );
    },
    failureMessage(engine) {
        const run = growthRuns.get(engine);
        return `cast=${run?.cast} sawBurrow=${run?.sawBurrow} killedMortar=${run?.killedMortar} seeds=${seedsOf(engine).length}`;
    },
};

interface RingRun {
    heart: Unit;
    rings: number;
}
const ringRuns = new WeakMap<GameEngine, RingRun>();

export const gardenHeartSpikeRingScenario: ScenarioDefinition = {
    id: 'garden_heart_spike_ring_final',
    title: 'Garden Heart: shelled in the final phase, the Heart fires 2 Spike Rings a round (no escalation)',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 12000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 30, gridH: 20, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(4), y: cell(4), abilities: [] });
        player.maxHp = 9999;
        player.hp = 9999; // stands in the rings for the whole round
        const heart = addEnemy(engine, ENEMY_GARDEN_HEART, cell(15), cell(10));
        peekPhaseState(heart)!.index = 3; // final growth phase
        growGardenTree(engine as unknown as GardenGrowContext, heart, 4); // shelled: the ring fires at the phase's base rate
        const run: RingRun = { heart, rings: 0 };
        engine.eventBus.on('ability_used', (e) => {
            if (e.abilityId === SPIKE_RING_ABILITY_ID) run.rings++;
        });
        ringRuns.set(engine, run);
        holdOpen(engine, player, 11);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = ringRuns.get(engine)!;
        return engine.gameTime >= ROUND_DURATION + 0.1 && run.rings === 2;
    },
    failureMessage(engine) {
        return `rings=${ringRuns.get(engine)?.rings} gameTime=${engine.gameTime.toFixed(2)}`;
    },
};

// ---------------------------------------------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------------------------------------------

const reflexOf = (u: Unit): number => u.getResource(ResourceId.Reflex)?.current ?? -1;

function answerOrdinaryPlane(engine: GameEngine): void {
    for (const w of engine.waitingForOrders?.waiters ?? []) {
        engine.state.orderMgr.applyOrder({ unitId: w.unitId, abilityId: 'wait', targets: [], endTurn: true });
    }
}

/** Step (answering ordinary planes) until a plane with a reaction waiter forms. */
function stepToReactionPause(engine: GameEngine): void {
    for (let i = 0; i < 10 * TPS; i++) {
        const plane = engine.waitingForOrders;
        if (plane) {
            if (plane.waiters.some((w) => engine.getUnit(w.unitId)?.reactionPending)) return;
            answerOrdinaryPlane(engine);
        }
        engine.stepSimulationFixedTicks(1);
    }
    throw new Error('no reaction pause formed');
}

/** One player (P1) inside a Pod Mortar telegraph; P2 (co-op variant) stands well outside it. Both know Reactions. */
function buildReactionEngine(withSecondPlayer: boolean): { engine: GameEngine; p1: Unit; p2: Unit | null } {
    const engine = buildTinyBattleEngine({ gridW: 40, gridH: 16, localPlayerId: P1, grass: true });
    engine.enemyScalingPlayerCount = 1;
    const p1 = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(10), y: cell(8), abilities: [REACT_ABILITY] });
    const p2 = withSecondPlayer
        ? spawnTinyPlayerUnit(engine, { playerId: P2, x: cell(30), y: cell(8), abilities: [REACT_ABILITY] })
        : null;
    engine.playerKnowledgeKeysByPlayer = { [P1]: [KNOWLEDGE_REACTIONS], [P2]: [KNOWLEDGE_REACTIONS] };
    for (const u of [p1, p2]) if (u) attachReflexIfKnown(u, engine.eventBus, true);
    spawnFusedBody(engine, { characterId: 'pod_seed', x: p1.x, y: p1.y, unitId: 'seed' });
    stepToReactionPause(engine);
    return { engine, p1, p2 };
}

interface ReactionRun {
    p1: Unit;
    pausedAtTick: number;
    reflexAtPause: number;
    onlyWaiterWasP1: boolean;
    spent: boolean;
}
const reactionRuns = new WeakMap<GameEngine, ReactionRun>();

export const gardenHeartReactionScenario: ScenarioDefinition = {
    id: 'garden_heart_reaction',
    title: 'Reactions: paused in a Pod Mortar telegraph, acting spends 1 Reflex, it is back after a round',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 14000,
    buildEngine() {
        const { engine, p1 } = buildReactionEngine(false);
        const plane = engine.waitingForOrders!;
        reactionRuns.set(engine, {
            p1,
            pausedAtTick: engine.gameTick,
            reflexAtPause: reflexOf(p1),
            onlyWaiterWasP1: plane.waiters.length === 1 && plane.waiters[0]!.unitId === p1.id && !!p1.reactionPending,
            spent: false,
        });
        holdOpen(engine, p1, 11.5); // past the round-2 start (10 s)
        return engine;
    },
    getInitialOrders(engine) {
        // The reaction decision itself: act (not pass).
        return [{ unitId: reactionRuns.get(engine)!.p1.id, abilityId: REACT_ABILITY, targets: [], endTurn: true }];
    },
    assertPass(engine) {
        const run = reactionRuns.get(engine)!;
        if (reflexOf(run.p1) === 0) run.spent = true;
        return (
            run.onlyWaiterWasP1 &&
            run.reflexAtPause === 1 &&
            run.spent &&
            !run.p1.reactionPending &&
            engine.roundNumber >= 2 &&
            reflexOf(run.p1) === 1
        );
    },
    failureMessage(engine) {
        const r = reactionRuns.get(engine);
        return `onlyWaiterWasP1=${r?.onlyWaiterWasP1} reflexAtPause=${r?.reflexAtPause} spent=${r?.spent} reflexNow=${r ? reflexOf(r.p1) : '?'} round=${engine.roundNumber}`;
    },
};

interface ClaimRun {
    p1: Unit;
    p2: Unit;
    planeId: string;
    claimAccepted: boolean;
    waitersAtClaim: number;
    planeOpenAfterFirstOrder: boolean;
    atTick: number;
}
const claimRuns = new WeakMap<GameEngine, ClaimRun>();

export const gardenHeartCoopClaimScenario: ScenarioDefinition = {
    id: 'garden_heart_coop_claim',
    title: 'Reactions co-op: a second player claims the reaction, both act, the plane resumes after both orders',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 8000,
    buildEngine() {
        const { engine, p1, p2 } = buildReactionEngine(true);
        const planeId = engine.waitingForOrders!.planeId!;
        const claimAccepted = applyReactionClaim(engine, planeId, p2!.id);
        claimRuns.set(engine, {
            p1,
            p2: p2!,
            planeId,
            claimAccepted,
            waitersAtClaim: engine.waitingForOrders?.waiters.length ?? 0,
            planeOpenAfterFirstOrder: false,
            atTick: engine.gameTick,
        });
        holdOpen(engine, p1, 7);
        return engine;
    },
    getInitialOrders(engine) {
        const run = claimRuns.get(engine)!;
        // First order is applied here so the scenario can see the plane still waiting for the claimant.
        engine.state.orderMgr.applyOrder({ unitId: run.p1.id, abilityId: REACT_ABILITY, targets: [], endTurn: true });
        run.planeOpenAfterFirstOrder = engine.waitingForOrders?.planeId === run.planeId;
        return [{ unitId: run.p2.id, abilityId: REACT_ABILITY, targets: [], endTurn: true }];
    },
    assertPass(engine) {
        const run = claimRuns.get(engine)!;
        return (
            run.claimAccepted &&
            run.waitersAtClaim === 2 &&
            run.planeOpenAfterFirstOrder &&
            engine.waitingForOrders?.planeId !== run.planeId &&
            engine.gameTick > run.atTick + 30 && // the battle actually resumed
            reflexOf(run.p1) === 0 &&
            reflexOf(run.p2) === 0 &&
            !run.p1.reactionPending &&
            !run.p2.reactionPending
        );
    },
    failureMessage(engine) {
        const r = claimRuns.get(engine);
        return `claimAccepted=${r?.claimAccepted} waiters=${r?.waitersAtClaim} openAfterFirst=${r?.planeOpenAfterFirstOrder} reflex=${r ? [reflexOf(r.p1), reflexOf(r.p2)] : '?'}`;
    },
};

// ---------------------------------------------------------------------------------------------------------------
// Bared windows, Severance, the Gloam Lily and Wild attacks
// ---------------------------------------------------------------------------------------------------------------

interface BaredRun {
    heart: Unit;
    layoutSize: number;
    killed: boolean;
    sawOpen: boolean;
    sawPinwheel: boolean;
}
const baredRuns = new WeakMap<GameEngine, BaredRun>();
const livingNodes = (engine: GameEngine, heart: Unit): Unit[] =>
    gardenTreeDescendants(engine, heart).filter((u) => u.isAlive());

/** Kill every living node under `heart`, deepest first, as a player would (Severance, and Bared at the last). */
function killTree(engine: GameEngine, heart: Unit, killerId: string): void {
    for (const node of gardenTreeDescendants(engine, heart).reverse()) {
        if (node.isAlive()) node.takeDamage(node.maxHp * 10, killerId, engine.eventBus);
    }
}

export const gardenHeartBaredRegrowthScenario: ScenarioDefinition = {
    id: 'garden_heart_bared_regrowth',
    title: 'Garden Heart: killing the phase-2 tree Bares the Heart, a Pinwheel fires, then the whole tree regrows',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 10000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 30, gridH: 20, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(2), y: cell(2), abilities: [] });
        player.maxHp = player.hp = 9999; // the Pinwheel's thorns must not end the scenario
        const heart = addEnemy(engine, ENEMY_GARDEN_HEART, cell(15), cell(10));
        peekPhaseState(heart)!.index = 1; // growth phase 2
        growGardenTree(engine as unknown as GardenGrowContext, heart, 2);
        baredRuns.set(engine, {
            heart,
            layoutSize: gardenTreeLayout(2)!.length,
            killed: false,
            sawOpen: false,
            sawPinwheel: false,
        });
        holdOpen(engine, player, 9);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = baredRuns.get(engine)!;
        if (!run.killed && engine.gameTick >= 5) {
            killTree(engine, run.heart, engine.getLocalPlayerUnit()!.id);
            run.killed = true;
        }
        if (getNodeRegrowthStatus(run.heart, engine.gameTime).open) run.sawOpen = true;
        if (engine.projectiles.some((p) => p.sourceAbilityId === PINWHEEL_ABILITY_ID)) run.sawPinwheel = true;
        return (
            run.killed &&
            run.sawOpen &&
            run.sawPinwheel &&
            !getNodeRegrowthStatus(run.heart, engine.gameTime).open &&
            livingNodes(engine, run.heart).length === run.layoutSize
        );
    },
    failureMessage(engine) {
        const run = baredRuns.get(engine);
        return `killed=${run?.killed} sawOpen=${run?.sawOpen} sawPinwheel=${run?.sawPinwheel} livingNodes=${run ? livingNodes(engine, run.heart).length : '?'}/${run?.layoutSize}`;
    },
};

interface SeveranceRun {
    heart: Unit;
    player: Unit;
    maxHp: number;
    killedTrees: number;
    sawBurrow: boolean;
}
const severanceRuns = new WeakMap<GameEngine, SeveranceRun>();

export const gardenHeartSeveranceScenario: ScenarioDefinition = {
    id: 'garden_heart_severance',
    title: 'Garden Heart: killing nodes alone (never hitting the Heart) takes the Heart through a phase retreat',
    category: 'general',
    generalSection: SECTION,
    // Each Bared window is 5 s and the tree is cut again as it regrows; the retreat itself takes a few more seconds.
    maxDurationMs: 40000,
    buildEngine() {
        const { engine, heart, player } = buildGardenMissionEngine();
        severanceRuns.set(engine, { heart, player, maxHp: heart.maxHp, killedTrees: 0, sawBurrow: false });
        holdOpen(engine, player, 38);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = severanceRuns.get(engine)!;
        const { heart } = run;
        const phase = peekPhaseState(heart);
        if (phase?.burrow) {
            run.sawBurrow = true;
            return false;
        }
        if (!run.sawBurrow && engine.gameTick >= 2 && livingNodes(engine, heart).length > 0) {
            killTree(engine, heart, run.player.id); // only ever the nodes: the Heart itself is never hit
            run.killedTrees++;
        }
        return (
            run.sawBurrow &&
            (phase?.index ?? 0) >= 1 &&
            run.killedTrees >= 2 &&
            Math.abs(heart.hp - run.maxHp * GARDEN_HEART_RETREAT_FRACTION_2) < 1e-6
        );
    },
    failureMessage(engine) {
        const run = severanceRuns.get(engine);
        if (!run) return 'no run';
        return `killedTrees=${run.killedTrees} sawBurrow=${run.sawBurrow} phaseIndex=${peekPhaseState(run.heart)?.index} heartHp=${run.heart.hp}/${run.maxHp}`;
    },
};

interface LightRun {
    lily: Unit;
    lightId: string;
    shareLit: number;
    wolfWhileLit: boolean;
}
const lightRuns = new WeakMap<GameEngine, LightRun>();
const wolvesIn = (engine: GameEngine): Unit[] =>
    engine.units.filter((u) => u.characterId === 'dark_wolf' && u.isAlive());
const lightStrength = (engine: GameEngine, id: string): number =>
    engine.specialTiles.find((t) => t.id === id)?.emitsLight?.lightAmount ?? 0;

export const gardenHeartLightAndDarknessScenario: ScenarioDefinition = {
    id: 'garden_heart_light_and_darkness',
    title: 'Garden Heart: a Gloam Lily left alone puts the light out, and the dark lets a dark wolf in',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 8000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 8, gridH: 5, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(0), y: cell(4), abilities: [] });
        player.maxHp = player.hp = 9999; // the wolf hunts the player
        // One faint light that reaches the whole small arena, so none of it is dark until the Lily drinks it.
        const lightId = 'garden_crystal';
        engine.addSpecialTile({
            id: lightId,
            defId: 'Campfire',
            col: 1,
            row: 2,
            hp: 5,
            maxHp: 5,
            emitsLight: { lightAmount: 1, radius: 9 },
        });
        engine.setMissionLightConfig(true, 0);
        // The Lily keeps its real AI: left alone, it drinks.
        const lily = createUnitFromSpawnConfig(
            { ...ENEMY_GLOAM_LILY, x: cell(6), y: cell(2), ownerId: 'ai' },
            engine.eventBus,
            engine,
        );
        engine.addUnit(lily, 'initialGameSpawn');
        // The mission's darkness spawn, started at once (the mission gates it on the second tree via a trigger, which is
        // covered by gardenHeartMission.test.ts).
        const darknessSpawn: LevelEvent = {
            ...(GARDEN_DARKNESS_SPAWN as LevelEventContinuousSpawn),
            afterTrigger: undefined,
            trigger: { intervalRounds: 2, startRound: 1 },
        };
        engine.registerLevelEvents([darknessSpawn]);
        lightRuns.set(engine, { lily, lightId, shareLit: darkShare(engine), wolfWhileLit: false });
        holdOpen(engine, player, 7);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = lightRuns.get(engine)!;
        const out = lightStrength(engine, run.lightId) <= 0;
        if (!out && wolvesIn(engine).length > 0) run.wolfWhileLit = true;
        return (
            run.shareLit < 0.15 &&
            !run.wolfWhileLit &&
            out &&
            darkShare(engine) >= 0.15 &&
            wolvesIn(engine).length > 0
        );
    },
    failureMessage(engine) {
        const run = lightRuns.get(engine);
        return `litShare=${run?.shareLit} wolfWhileLit=${run?.wolfWhileLit} light=${run ? lightStrength(engine, run.lightId) : '?'} darkShare=${darkShare(engine).toFixed(2)} wolves=${wolvesIn(engine).length}`;
    },
};

interface WildRun {
    heart: Unit;
    wolf: Unit;
    bloom: Unit;
    cast: boolean;
    wolfHit: boolean;
    bloomHit: boolean;
    thornPassedBloom: boolean;
}
const wildRuns = new WeakMap<GameEngine, WildRun>();

export const gardenHeartWildScenario: ScenarioDefinition = {
    id: 'garden_heart_wild',
    title: 'Garden Heart: a Pinwheel thorn hits a dark wolf in its path and passes through a plant',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 9000,
    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 16, gridH: 10, localPlayerId: P1, grass: true });
        engine.enemyScalingPlayerCount = 1;
        const player = spawnTinyPlayerUnit(engine, { playerId: P1, x: cell(1), y: cell(1), abilities: [] });
        player.maxHp = player.hp = 9999;
        const heart = addEnemy(engine, ENEMY_GARDEN_HEART, cell(8), cell(5));
        // Close enough that the arm's thorns are less than a unit width apart where they pass; the arm sweeps every
        // direction once in the window, so each of them is crossed.
        const wolf = addEnemy(engine, ENEMY_DARK_WOLF, heart.x + 100, heart.y);
        const bloom = addEnemy(engine, ENEMY_MENDER_BLOOM, heart.x - 100, heart.y);
        wolf.maxHp = wolf.hp = 100000; // survives the thorns so the hit can be seen
        // A forced cast, as the Bared callback does.
        grantAbilityUses(heart, PINWHEEL_ABILITY_ID, 1);
        executeUnitAbility(heart, getAbility(PINWHEEL_ABILITY_ID)!, [], engine);
        const run: WildRun = { heart, wolf, bloom, cast: true, wolfHit: false, bloomHit: false, thornPassedBloom: false };
        engine.eventBus.on('damage_taken', (e: DamageTakenEvent) => {
            if (e.unitId === wolf.id) run.wolfHit = true;
            if (e.unitId === bloom.id) run.bloomHit = true;
        });
        wildRuns.set(engine, run);
        holdOpen(engine, player, 8);
        return engine;
    },
    getInitialOrders(engine) {
        return [{ unitId: engine.getLocalPlayerUnit()!.id, abilityId: 'wait', targets: [] }];
    },
    assertPass(engine) {
        const run = wildRuns.get(engine)!;
        for (const p of engine.projectiles) {
            if (p.sourceAbilityId === PINWHEEL_ABILITY_ID && Math.hypot(p.x - run.bloom.x, p.y - run.bloom.y) < 14) {
                run.thornPassedBloom = true;
            }
        }
        return run.wolfHit && run.thornPassedBloom && !run.bloomHit && run.bloom.hp === run.bloom.maxHp;
    },
    failureMessage(engine) {
        const run = wildRuns.get(engine);
        return `cast=${run?.cast} wolfHit=${run?.wolfHit} thornPassedBloom=${run?.thornPassedBloom} bloomHit=${run?.bloomHit}`;
    },
};

export const GARDEN_HEART_SCENARIOS: ScenarioDefinition[] = [
    gardenHeartBaredRegrowthScenario,
    gardenHeartSeveranceScenario,
    gardenHeartLightAndDarknessScenario,
    gardenHeartWildScenario,
    gardenHeartShellScenario,
    gardenHeartPhaseRetreatScenario,
    gardenHeartSeedDestroyedScenario,
    gardenHeartSeedGrowthScenario,
    gardenHeartSpikeRingScenario,
    gardenHeartReactionScenario,
    gardenHeartCoopClaimScenario,
];
