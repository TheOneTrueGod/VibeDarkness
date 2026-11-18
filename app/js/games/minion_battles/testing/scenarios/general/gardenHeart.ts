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
import type { EnemySpawnDef } from '../../../storylines/types';
import type { DamageTakenEvent } from '../../../game/EventBus';
import { createUnitFromSpawnConfig } from '../../../game/units';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { GameEngine as GameEngineClass } from '../../../game/GameEngine';
import { ENEMY_GARDEN_HEART, ENEMY_POD_MORTAR, ENEMY_THORNSPITTER } from '../../../constants/enemyConstants';
import { getNodeChildIds, hasLivingChildren, linkNodeChild } from '../../../game/units/components/nodeTree';
import { peekFusedBodyState } from '../../../game/units/components/fusedBodyComponent';
import { spawnFusedBody } from '../../../game/units/components/fusedBodySpawn';
import { peekPhaseState } from '../../../game/units/components/phaseComponent';
import { gardenTreeLayout } from '../../../game/gardenHeart/gardenTreeLayouts';
import { GARDEN_SPROUT_POINTS } from '../../../card_defs/16_enemy_garden_heart/gardenHeartPhases';
import { attachReflexIfKnown } from '../../../resources/Reflex';
import { ResourceId } from '../../../resources/resourceIds';
import { applyReactionClaim } from '../../../game/reactions/claimRule';
import { KNOWLEDGE_REACTIONS } from '../../../../../accountKnowledge';
import { registerWorldOfDarknessSegments } from '../../../storylines/WorldOfDarkness/registerSegments';
import { GARDEN_HEART } from '../../../storylines/WorldOfDarkness/missions/020_garden_heart';
import { buildTinyBattleEngine, spawnTinyPlayerUnit, TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { BURROWING_PROJECTILE_TYPE } from '../../../game/projectiles/projectile_defs/burrowingDef';
import { LOB_SEED_ABILITY_ID, SPIKE_RING_ABILITY_ID } from '../../../card_defs/16_enemy_garden_heart/gardenHeartConstants';
import { ROUND_DURATION } from '../../../game/gameConstants';
import '../../../abilities/AbilityRegistry';

const SECTION = 'Garden Heart';
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

export const gardenHeartPhaseRetreatScenario: ScenarioDefinition = {
    id: 'garden_heart_phase_retreat',
    title: 'Garden Heart: a big hit at 75% retreats, old tree becomes Briar, Heart resurfaces with the phase-2 tree',
    category: 'general',
    generalSection: SECTION,
    maxDurationMs: 16000,
    buildEngine() {
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
        player.hp = player.maxHp = 100000; // the eruption must not end the scenario
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
            heart.hp === run.maxHp * 0.75 && // damage past the threshold is lost
            run.oldTree.every((u) => !u.isAlive()) &&
            countBriar(engine) > run.briarBefore &&
            GARDEN_SPROUT_POINTS.some((p) => p.x === heart.x && p.y === heart.y) &&
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
    title: 'Garden Heart: with the final tree cut down, the Heart fires 8 Spike Rings a round',
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
        peekPhaseState(heart)!.index = 3; // final growth phase, no tree left
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
        return engine.gameTime >= ROUND_DURATION + 0.1 && run.rings === 8;
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

export const GARDEN_HEART_SCENARIOS: ScenarioDefinition[] = [
    gardenHeartShellScenario,
    gardenHeartPhaseRetreatScenario,
    gardenHeartSeedDestroyedScenario,
    gardenHeartSeedGrowthScenario,
    gardenHeartSpikeRingScenario,
    gardenHeartReactionScenario,
    gardenHeartCoopClaimScenario,
];
