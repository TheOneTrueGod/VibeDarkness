/**
 * Engine-level unit tests for interactive sequential targeting (Steps 1–2).
 *
 * These tests exercise the pause/resume mechanism added in unitAbilityTick.ts
 * without going through BattleSession or the UI layer.
 *
 * Scenario A: Engine pauses when a SelectTargetDef interval is entered on a
 *             preview order (targetsByLabel: {}).
 * Scenario B: Engine resumes and fires the blocked interval after the target is
 *             injected into targetsByLabel, then pauses again for the second
 *             punch, and both enemies take damage.
 * Scenario F: After final target injected, engine runs final hit then pauses (not waitingForOrders).
 * Scenario G: Light Blast playahead pauses before active interval; inject damages enemy.
 * Scenario H: Committed vs preview Light Blast damage timing matches within FIXED_DT.
 * Scenario I: Swing Bat deferred preview pauses before cast (windup lunge).
 * Scenario J: Swing Bat preview with positional target runs windup lunge before hit interval.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import type { BattleOrder, ResolvedTarget } from './types';
import {
    buildFinalizedSequentialTargetingOrder,
    buildPositionalTargetsFromLabels,
    isPurePassOrder,
} from './interaction/InteractiveTargetingSession';
import { spawnBrightLight } from '../abilities/brightKeyword';
import { findPreviewDeferredSelectLabel } from './interaction/selectTargetLookahead';
import { getAbility } from '../abilities/AbilityRegistry';
import { SwingBatCard } from '../card_defs/0115_SwingBat/0115Ability';
import type { WindupLungePayload } from '../abilities/WindupLunge';
import { DEFAULT_MELEE_LUNGE } from './units/unit_defs/unitConstants';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { Light } from '../resources/Light';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { PlayerState } from '../../../types';
import { BattleSession } from './BattleSession';
import { OrderManager } from './managers/OrderManager';
import { hashOrderId } from './battlenet/helpers/orderHashing';

/** Double Punch ability id — matches `DoublePunchAbility.id` in `0116Ability.ts`. */
const DOUBLE_PUNCH_ABILITY_ID = '0116';
/** SelectTargetDef labels on Double Punch timings. */
const DOUBLE_PUNCH_TARGET_1_LABEL = 'Target 1';
const DOUBLE_PUNCH_TARGET_2_LABEL = 'Target 2';

/** Matches `GameEngine` fixed timestep. */
const FIXED_DT = 1 / 60;
/** Matches `0801Ability` `PREFIRE_TIME`. */
const LIGHT_BLAST_ID = '0801';
const LIGHT_BLAST_PREFIRE = 0.4;
/** Matches `0801Ability` `resourceCost.amount`. */
const LIGHT_BLAST_LIGHT_COST = 2;
/** SelectTargetDef label on Light Blast timings. */
const LIGHT_BLAST_TARGET_LABEL = 'Target';

beforeAll(() => {
    if (globalThis.requestAnimationFrame === undefined) {
        vi.stubGlobal(
            'requestAnimationFrame',
            (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
        );
        vi.stubGlobal('cancelAnimationFrame', (id: number) =>
            clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
        );
    }
});

afterAll(() => {
    vi.unstubAllGlobals();
});

function makeApiStub(): MinionBattlesApi {
    return {
        setCurrentPlayerId: vi.fn(),
        sendMessage: vi.fn().mockResolvedValue({ messageId: 1 }),
    } as unknown as MinionBattlesApi;
}

function makePurePassOrder(unitId: string): BattleOrder {
    return {
        unitId,
        abilityId: 'wait',
        targets: [],
        endTurn: true,
    };
}

interface LightBlastSessionFixture {
    session: BattleSession;
    engine: GameEngine;
    casterUnitId: string;
    remoteUnitId: string;
    atTick: number;
    blastPixel: { x: number; y: number };
}

/** Host session paused at a parallel batch with Light Blast on the local caster. */
async function mountLightBlastSessionFixture(): Promise<LightBlastSessionFixture> {
    const session = new BattleSession({
        api: makeApiStub(),
        missionId: 'dark_awakening',
        playerId: 'p1',
        isHost: true,
    });
    const players: Record<string, PlayerState> = {
        p1: { id: 'p1', name: 'P1', color: '#fff' },
        p2: { id: 'p2', name: 'P2', color: '#000' },
    };
    const characterSelections = { p1: 'warrior', p2: 'ranger' };

    await session.load({
        players,
        characterSelections,
        battleSeed: 1,
    });
    const engine = session.getEngine()!;
    engine.stop();

    for (let i = 0; i < 400; i++) {
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        const batch = engine.waitingForOrders;
        if (batch?.waiters.some((w) => w.ownerId === 'p1') && batch.waiters.length >= 2) {
            const casterUnitId = engine.state.orderMgr.getActiveOrderWaiterForPlayer('p1')?.unitId;
            const remoteUnitId = batch.waiters.find((w) => w.ownerId === 'p2')?.unitId;
            if (casterUnitId && remoteUnitId) {
                const caster = engine.getUnit(casterUnitId)!;
                caster.abilities = [LIGHT_BLAST_ID];
                initializeAbilityRuntimeForUnit(caster);
                const light = new Light();
                caster.attachResource(light, engine.eventBus);
                light.add(LIGHT_BLAST_LIGHT_COST);

                const blastPixel = { x: caster.x + 30, y: caster.y };
                const enemy = createTargetDummyAtWorld(engine, blastPixel.x, blastPixel.y, {
                    id: 'enemy_commit_test',
                    hp: 100,
                });
                initializeAbilityRuntimeForUnit(enemy);
                engine.addUnit(enemy, 'initialGameSpawn');

                return {
                    session,
                    engine,
                    casterUnitId,
                    remoteUnitId,
                    atTick: batch.atTick,
                    blastPixel,
                };
            }
        }
    }
    throw new Error('expected parallel pause for p1 and p2');
}

function runLightBlastPreviewToDone(
    session: BattleSession,
    casterUnitId: string,
    blastPixel: { x: number; y: number },
): void {
    const engine = session.getEngine()!;
    const caster = engine.getUnit(casterUnitId)!;
    const its = session.interactiveTargeting;

    its.begin(
        {
            unitId: casterUnitId,
            abilityId: LIGHT_BLAST_ID,
            targets: [],
            endTurn: true,
        },
        session,
    );

    const paused = stepUntil(engine, () => engine.waitingForTargetInput?.label === LIGHT_BLAST_TARGET_LABEL, 120);
    expect(paused).toBe(true);

    its.resolveTarget(
        LIGHT_BLAST_TARGET_LABEL,
        { type: 'pixel', position: blastPixel },
        session,
    );

    const done = stepUntil(
        engine,
        () => engine.isPaused && caster.activeAbilities.length === 0 && engine.waitingForOrders == null,
        300,
    );
    expect(done).toBe(true);
}

/** Swing Bat — matches `SwingBatCard.abilityId` in `0115Ability.ts`. */
const SWING_BAT_ABILITY_ID = SwingBatCard.abilityId;
/** SelectTargetDef label on Swing Bat timings. */
const SWING_BAT_TARGET_LABEL = 'Target';
/** Matches `0115Ability` windup interval end. */
const SWING_BAT_WINDUP_END = 0.2;
/** Hitbox reach before lunge extension — matches `0115Ability` `BASE_MAX_RANGE`. */
const SWING_BAT_HITBOX_MAX_RANGE = 25;

interface SwingBatFixture {
    engine: ReturnType<typeof buildTinyBattleEngine>;
    player: Unit;
    aimPixel: { x: number; y: number };
}

/** Player with Swing Bat; aim point at max lunge+hitbox range east. */
function buildSwingBatFixture(): SwingBatFixture {
    resetGameObjectIdCounter(1);

    const engine = buildTinyBattleEngine({
        gridW: 16,
        gridH: 10,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });

    const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
    const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: playerX,
        y: playerY,
        abilities: [SWING_BAT_ABILITY_ID],
    });

    const aimPixel = {
        x: playerX + SWING_BAT_HITBOX_MAX_RANGE + DEFAULT_MELEE_LUNGE,
        y: playerY,
    };

    return { engine, player, aimPixel };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Step engine forward one tick at a time until predicate returns true or limit reached. */
function stepUntil(
    engine: ReturnType<typeof buildTinyBattleEngine>,
    predicate: () => boolean,
    maxTicks = 300,
): boolean {
    for (let i = 0; i < maxTicks; i++) {
        if (predicate()) return true;
        engine.stepSimulationFixedTicks(1);
    }
    return predicate();
}

function getCastElapsed(engine: GameEngine, player: Unit, abilityId: string): number {
    const active = player.activeAbilities.find(a => a.abilityId === abilityId);
    if (!active) return -1;
    return engine.gameTime - active.startTime;
}

interface LightBlastFixture {
    engine: ReturnType<typeof buildTinyBattleEngine>;
    player: Unit;
    enemy: Unit;
    blastPixel: { x: number; y: number };
}

/** Player with Light Blast + light resource; enemy dummy inside blast radius at `blastPixel`. */
function buildLightBlastFixture(): LightBlastFixture {
    resetGameObjectIdCounter(1);

    const engine = buildTinyBattleEngine({
        gridW: 12,
        gridH: 10,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });

    const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
    const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: playerX,
        y: playerY,
        abilities: [LIGHT_BLAST_ID],
    });

    const light = new Light();
    player.attachResource(light, engine.eventBus);
    light.add(LIGHT_BLAST_LIGHT_COST);

    const blastPixel = { x: playerX + 30, y: playerY };
    const enemy = createTargetDummyAtWorld(engine, blastPixel.x, blastPixel.y, {
        id: 'enemy_1',
        hp: 100,
    });
    initializeAbilityRuntimeForUnit(enemy);
    engine.addUnit(enemy, 'initialGameSpawn');

    return { engine, player, enemy, blastPixel };
}

function stepUntilEnemyDamaged(
    engine: GameEngine,
    player: Unit,
    enemy: Unit,
    abilityId: string,
    initialHp: number,
    maxTicks = 300,
): { damaged: boolean; elapsedAtDamage: number | null } {
    for (let i = 0; i < maxTicks; i++) {
        engine.stepSimulationFixedTicks(1);
        if (enemy.hp < initialHp) {
            return { damaged: true, elapsedAtDamage: getCastElapsed(engine, player, abilityId) };
        }
        if (player.activeAbilities.length === 0) break;
    }
    return { damaged: false, elapsedAtDamage: null };
}

interface DoublePunchParityFixture {
    engine: GameEngine;
    player: Unit;
    e1: Unit;
    e2: Unit;
}

/** Identical Double Punch layout: player centre, e1 right, e2 below (Scenario B geometry). */
function buildDoublePunchParityFixture(): DoublePunchParityFixture {
    resetGameObjectIdCounter(1);

    const engine = buildTinyBattleEngine({
        gridW: 12,
        gridH: 10,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
        grass: true,
    });

    const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
    const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
    const player = spawnTinyPlayerUnit(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        x: playerX,
        y: playerY,
        abilities: [DOUBLE_PUNCH_ABILITY_ID],
    });

    const e1 = createTargetDummyAtWorld(engine, playerX + 42, playerY, { id: 'enemy_1', hp: 100 });
    initializeAbilityRuntimeForUnit(e1);
    engine.addUnit(e1, 'initialGameSpawn');

    const e2 = createTargetDummyAtWorld(engine, playerX, playerY + 45, { id: 'enemy_2', hp: 100 });
    initializeAbilityRuntimeForUnit(e2);
    engine.addUnit(e2, 'initialGameSpawn');

    stepUntil(engine, () => engine.waitingForOrders != null);

    return { engine, player, e1, e2 };
}

function doublePunchAbilityActive(player: Unit): boolean {
    return player.activeAbilities.some((a) => a.abilityId === DOUBLE_PUNCH_ABILITY_ID);
}

function stepUntilDoublePunchComplete(engine: GameEngine, player: Unit): void {
    const done = stepUntil(engine, () => !doublePunchAbilityActive(player), 300);
    expect(done).toBe(true);
}

function stepEngineToGameTick(engine: GameEngine, targetTick: number): void {
    const extra = targetTick - engine.gameTick;
    expect(extra).toBeGreaterThanOrEqual(0);
    if (extra > 0) {
        engine.stepSimulationFixedTicks(extra);
    }
    expect(engine.gameTick).toBe(targetTick);
}

function alignEnginesToSameTick(engineA: GameEngine, engineB: GameEngine): number {
    const targetTick = Math.max(engineA.gameTick, engineB.gameTick);
    for (const engine of [engineA, engineB]) {
        // Committed runs freeze at `waitingForOrders`; unfreeze so both can reach `targetTick`.
        if (engine.waitingForOrders != null) {
            engine.state.orderMgr.waitingForOrders = null;
            engine.isPaused = false;
        }
        stepEngineToGameTick(engine, targetTick);
    }
    return targetTick;
}

function injectInteractiveTarget(
    engine: GameEngine,
    player: Unit,
    label: string,
    target: ResolvedTarget,
): void {
    const active = player.activeAbilities.find((a) => a.abilityId === DOUBLE_PUNCH_ABILITY_ID);
    expect(active).toBeDefined();
    if (!active!.targetsByLabel) active!.targetsByLabel = {};
    active!.targetsByLabel[label] = target;
    engine.waitingForTargetInput = null;
    engine.isPaused = false;
}

function waitForTargetLabel(engine: GameEngine, label: string): void {
    const paused = stepUntil(
        engine,
        () => engine.waitingForTargetInput?.label === label,
        120,
    );
    expect(paused).toBe(true);
}

function assertRuntimeParity(committed: GameEngine, interactive: GameEngine): void {
    expect(interactive.getRuntimeFingerprintHex()).toBe(committed.getRuntimeFingerprintHex());
    for (const unitA of committed.units) {
        const unitB = interactive.getUnit(unitA.id);
        expect(unitB).toBeDefined();
        expect(unitB!.hp).toBe(unitA.hp);
        expect(Math.floor(unitB!.x)).toBe(Math.floor(unitA.x));
        expect(Math.floor(unitB!.y)).toBe(Math.floor(unitA.y));
    }
}

interface DoublePunchOrderExtras {
    movePath?: { col: number; row: number }[];
    movementByLabel?: Record<string, { movePath: { col: number; row: number }[] }>;
}

function runCommittedDoublePunch(
    fixture: DoublePunchParityFixture,
    extras: DoublePunchOrderExtras = {},
): GameEngine {
    const { engine, player, e1, e2 } = fixture;

    engine.state.orderMgr.applyOrder({
        unitId: player.id,
        abilityId: DOUBLE_PUNCH_ABILITY_ID,
        targets: [
            { type: 'unit', unitId: e1.id },
            { type: 'unit', unitId: e2.id },
        ],
        endTurn: true,
        ...extras,
    });

    stepUntilDoublePunchComplete(engine, player);
    return engine;
}

/** Engine-side in-place commit: clear preview flags and unpause (no BattleNet / no restore). */
function simulateInPlaceCommitEngineStep(engine: GameEngine): void {
    engine.isSequentialTargetingPreview = false;
    engine.sequentialTargetingPreviewCast = null;
    engine.waitingForTargetInput = null;
    engine.isPaused = false;
}

function runInteractiveDoublePunch(
    fixture: DoublePunchParityFixture,
    extras: DoublePunchOrderExtras & {
        movementByLabelAtTarget2Pause?: { movePath: { col: number; row: number }[] };
    } = {},
): GameEngine {
    const { engine, player, e1, e2 } = fixture;

    engine.isSequentialTargetingPreview = true;
    engine.sequentialTargetingPreviewCast = {
        unitId: player.id,
        abilityId: DOUBLE_PUNCH_ABILITY_ID,
        startRound: engine.roundNumber,
    };

    engine.state.orderMgr.applyOrder({
        unitId: player.id,
        abilityId: DOUBLE_PUNCH_ABILITY_ID,
        targets: [],
        targetsByLabel: {},
        endTurn: true,
        ...(extras.movePath ? { movePath: extras.movePath } : {}),
    });

    waitForTargetLabel(engine, DOUBLE_PUNCH_TARGET_1_LABEL);
    injectInteractiveTarget(engine, player, DOUBLE_PUNCH_TARGET_1_LABEL, { type: 'unit', unitId: e1.id });

    waitForTargetLabel(engine, DOUBLE_PUNCH_TARGET_2_LABEL);
    if (extras.movementByLabelAtTarget2Pause) {
        const active = player.activeAbilities.find((a) => a.abilityId === DOUBLE_PUNCH_ABILITY_ID);
        expect(active).toBeDefined();
        if (!active!.movementByLabel) active!.movementByLabel = {};
        active!.movementByLabel[DOUBLE_PUNCH_TARGET_2_LABEL] = extras.movementByLabelAtTarget2Pause;
    }
    injectInteractiveTarget(engine, player, DOUBLE_PUNCH_TARGET_2_LABEL, { type: 'unit', unitId: e2.id });

    stepUntilDoublePunchComplete(engine, player);
    return engine;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('interactive sequential targeting', () => {
    /**
     * Scenario A — engine pauses at first SelectTargetDef interval.
     *
     * Submit a preview order for Double Punch (0116) with targetsByLabel: {} (empty, no
     * pre-filled targets). The engine should block the "punch1" interval and set
     * engine.waitingForTargetInput to { label: 'Target 1', ... }.
     */
    it('Scenario A: engine sets waitingForTargetInput when SelectTargetDef interval is entered', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Place player and two enemies within punch range (MAX_RANGE = 30 px).
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        // Enemies within 30 px of player (same cell is fine for test purposes).
        const e1 = createTargetDummyAtWorld(engine, playerX + 20, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        const e2 = createTargetDummyAtWorld(engine, playerX + 25, playerY, { id: 'enemy_2', hp: 100 });
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        // Advance until the engine pauses waiting for player orders.
        const gotWaitingForOrders = stepUntil(engine, () => engine.waitingForOrders != null);
        expect(gotWaitingForOrders).toBe(true);

        // Queue the preview order: targetsByLabel: {} signals interactive mode.
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        });

        // Step forward up to 120 ticks (≈2 seconds of sim time at 60 Hz);
        // the punch1 interval fires at ability-elapsed 0.2 s = 12 ticks.
        // We step one tick at a time and stop as soon as waitingForTargetInput is set.
        let pausedForTarget = false;
        for (let i = 0; i < 120; i++) {
            engine.stepSimulationFixedTicks(1);
            if (engine.waitingForTargetInput !== null) {
                pausedForTarget = true;
                break;
            }
        }

        expect(pausedForTarget).toBe(true);
        expect(engine.waitingForTargetInput).not.toBeNull();
        expect(engine.waitingForTargetInput!.label).toBe('Target 1');
        expect(engine.waitingForTargetInput!.unitId).toBe(player.id);
        expect(engine.waitingForTargetInput!.abilityId).toBe('0116');
        // The isPaused flag should be set (blocks the live loop).
        expect(engine.isPaused).toBe(true);

        engine.destroy();
    });

    /**
     * Pre-tick lookahead gate: while waitingForTargetInput is set, stepSimulationFixedTicks
     * must not advance gameTime or gameTick (frozen until the player picks).
     */
    it('stepSimulationFixedTicks does not advance gameTime while waitingForTargetInput', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        const e1 = createTargetDummyAtWorld(engine, playerX + 20, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        stepUntil(engine, () => engine.waitingForOrders != null);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        });

        stepUntil(engine, () => engine.waitingForTargetInput !== null);

        const frozenTime = engine.gameTime;
        const frozenTick = engine.gameTick;
        engine.stepSimulationFixedTicks(5);
        expect(engine.gameTime).toBe(frozenTime);
        expect(engine.gameTick).toBe(frozenTick);

        engine.destroy();
    });

    /**
     * Scenario B — engine resumes and fires both punch intervals after targets are injected.
     *
     * Continues from the state of Scenario A. After injecting Target 1, the engine should
     * transition to waiting for Target 2, then after injecting Target 2 both enemies take damage.
     */
    it('Scenario B: engine resumes after target injection and both enemies take damage', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Place player in the centre and two enemies at right angles so each punch
        // hits only its own target.
        //
        // The meleeLineHitbox(30, 20) has effective reach = 30 + DEFAULT_UNIT_RADIUS (20) = 50 px
        // (full maxRange) and hit tolerance = unit.radius (18) + lineThickness (20) = 38 px.
        //
        // To ensure punch1 (aimed right at e1) does NOT hit e2, e2 must be > 38 px below the
        // horizontal line. e2 is placed at +45 px below (distance 45 > 38). ✓
        //
        // To ensure punch2 (aimed down at e2) does NOT hit e1, e1 must be > 38 px to the right
        // of the vertical line. e1 is placed at +42 px to the right (distance 42 > 38). ✓
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        // e1: 42 px to the right of player (within rightward punch1 line, outside downward punch2 line).
        const e1 = createTargetDummyAtWorld(engine, playerX + 42, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        // e2: 45 px below player (within downward punch2 line, outside rightward punch1 line).
        const e2 = createTargetDummyAtWorld(engine, playerX, playerY + 45, { id: 'enemy_2', hp: 100 });
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        const e1InitialHp = e1.hp;
        const e2InitialHp = e2.hp;

        // Advance until waiting for orders.
        stepUntil(engine, () => engine.waitingForOrders != null);

        // Submit preview order — targetsByLabel: {} enables interactive mode.
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        });

        // ── Resolve Target 1 ──
        let pausedForTarget1 = false;
        for (let i = 0; i < 120; i++) {
            engine.stepSimulationFixedTicks(1);
            if (engine.waitingForTargetInput?.label === 'Target 1') {
                pausedForTarget1 = true;
                break;
            }
        }
        expect(pausedForTarget1).toBe(true);

        // Inject e1 as Target 1 and resume engine.
        const active = player.activeAbilities.find(a => a.abilityId === '0116');
        expect(active).not.toBeUndefined();
        active!.targetsByLabel!['Target 1'] = { type: 'unit', unitId: e1.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        // ── Advance until engine waits for Target 2 ──
        let pausedForTarget2 = false;
        for (let i = 0; i < 120; i++) {
            engine.stepSimulationFixedTicks(1);
            const wt = engine.waitingForTargetInput as GameEngine['waitingForTargetInput'];
            if (wt?.label === 'Target 2') {
                pausedForTarget2 = true;
                break;
            }
        }
        expect(pausedForTarget2).toBe(true);

        // Verify punch1 fired and e1 took damage before the Target 2 lookahead pause.
        expect(e1.hp).toBeLessThan(e1InitialHp);

        // ── Resolve Target 2 ──
        active!.targetsByLabel!['Target 2'] = { type: 'unit', unitId: e2.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        // ── Advance until the ability completes ──
        for (let i = 0; i < 300; i++) {
            engine.stepSimulationFixedTicks(1);
            if (player.activeAbilities.length === 0) break;
        }

        // Both enemies should have taken damage from their respective punches.
        expect(e2.hp).toBeLessThan(e2InitialHp);

        engine.destroy();
    });

    /**
     * Scenario C — non-interactive ability is completely unaffected.
     *
     * Submit a normal ability order for 0120 (PunchNEW) WITHOUT targetsByLabel set.
     * Committed orders leave targetsByLabel undefined, so waitingForTargetInput
     * must remain null for the entire cast.
     */
    it('Scenario C: normal order without targetsByLabel never sets waitingForTargetInput', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0120'],
        });

        // A single enemy within punch range.
        const enemy = createTargetDummyAtWorld(engine, playerX + 20, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        // Advance until waiting for orders.
        stepUntil(engine, () => engine.waitingForOrders != null);

        // Submit a normal order — no targetsByLabel field (leave it undefined).
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0120',
            targets: [{ type: 'unit', unitId: enemy.id }],
            endTurn: true,
        });

        // Step the entire ability duration without waitingForTargetInput ever becoming non-null.
        let targetInputWasSet = false;
        for (let i = 0; i < 200; i++) {
            engine.stepSimulationFixedTicks(1);
            if (engine.waitingForTargetInput !== null) {
                targetInputWasSet = true;
                break;
            }
            // Stop once the ability finishes.
            if (player.activeAbilities.length === 0 && engine.waitingForOrders != null) break;
        }

        expect(targetInputWasSet).toBe(false);
        expect(engine.waitingForTargetInput).toBeNull();

        engine.destroy();
    });

    /**
     * Scenario D — movePath in preview order is carried through to the unit's movement state.
     *
     * Submit a preview order for Double Punch (0116) with targetsByLabel: {} AND a
     * movePath pointing two cells to the left of the player's starting position.
     * After the order fires (next tick), the unit should have an active movement path
     * set toward the target cell. (Double Punch locks movement speed to 0 during the
     * cast, so the unit won't physically translate, but the movement path is set and
     * will execute after the cast completes — confirming movePath flows through.)
     */
    it('Scenario D: movePath in preview order is applied to unit movement state', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Place player in the middle of the grid.
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        // Two enemies within punch range so the ability can fire.
        const e1 = createTargetDummyAtWorld(engine, playerX + 42, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        const e2 = createTargetDummyAtWorld(engine, playerX, playerY + 45, { id: 'enemy_2', hp: 100 });
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        // Advance until the engine pauses waiting for player orders.
        stepUntil(engine, () => engine.waitingForOrders != null);

        // Move target: two cells to the left (col 2, row 5).
        const moveTargetCol = 2;
        const moveTargetRow = 5;

        // Submit a preview order with movePath AND targetsByLabel: {} sentinel.
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            targets: [],
            targetsByLabel: {},
            endTurn: true,
            movePath: [{ col: moveTargetCol, row: moveTargetRow }],
        });

        // Step one tick so applyOrderLogic fires (order scheduled at batch.atTick = gameTick + 1).
        engine.stepSimulationFixedTicks(1);

        // The unit's movement path should be set toward the target cell.
        // (Double Punch locks movement speed to 0 during the cast, so no translation yet,
        // but the path must be present so movement executes once the cast ends.)
        expect(player.movement).not.toBeNull();
        expect(player.movement?.path).toHaveLength(1);
        expect(player.movement?.path[0]).toEqual({ col: moveTargetCol, row: moveTargetRow });

        engine.destroy();
    });

    /**
     * Scenario E — committed-run order with movementByLabel applies movement at interval fire time.
     *
     * Submit a normal (non-preview) order for Double Punch (0116) with:
     * - movePath pointing toward column A (initial slide during windup)
     * - movementByLabel for 'Target 2' pointing toward column B (applied when punch2 fires)
     * - targets pre-filled positionally (no SelectTargetDef blocking)
     *
     * Assert:
     * 1. After order application, unit.movement points toward col A.
     * 2. After punch1 fires (label 'Target 1' has no movementByLabel entry), unit.movement
     *    still points toward col A (unchanged).
     * 3. After punch2 fires (at ~0.5 s), unit.movement switches to point toward col B.
     *
     * NOTE: Double Punch locks movement speed to 0 until 0.6 s, so the unit won't translate
     * physically — but setMovement is called and the path changes as expected.
     */
    it('Scenario E: movementByLabel applies movement at the correct interval fire time (committed run)', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        // Player placed in the middle.
        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        // Two enemies within punch range.
        const e1 = createTargetDummyAtWorld(engine, playerX + 42, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        const e2 = createTargetDummyAtWorld(engine, playerX, playerY + 45, { id: 'enemy_2', hp: 100 });
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        // Advance until the engine pauses waiting for player orders.
        stepUntil(engine, () => engine.waitingForOrders != null);

        // Movement A: toward col 2 (left of player)
        const moveColA = 2;
        const moveRowA = 5;
        // Movement B: toward col 8 (right of player, different row)
        const moveColB = 8;
        const moveRowB = 3;

        // Submit a normal (non-preview) order — targetsByLabel omitted on committed path.
        // movePath = path toward A; movementByLabel['Target 2'] = path toward B.
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            // Pre-fill targets positionally (e1 for punch1, e2 for punch2).
            targets: [
                { type: 'unit', unitId: e1.id },
                { type: 'unit', unitId: e2.id },
            ],
            endTurn: true,
            movePath: [{ col: moveColA, row: moveRowA }],
            movementByLabel: {
                'Target 2': { movePath: [{ col: moveColB, row: moveRowB }] },
            },
        });

        // Step one tick — applyOrderLogic fires.
        engine.stepSimulationFixedTicks(1);

        // Assert 1: unit.movement should point toward col A.
        expect(player.movement).not.toBeNull();
        expect(player.movement?.path[player.movement.path.length - 1]).toEqual({ col: moveColA, row: moveRowA });

        const activeAbility = player.activeAbilities.find(a => a.abilityId === '0116');
        expect(activeAbility).not.toBeUndefined();

        // Step until just after punch1 fires (elapsed > 0.25 s) but before punch2 (0.5 s).
        // After punch1, 'Target 1' has no movementByLabel entry, so movement path stays A.
        let passedPunch1 = false;
        let passedPunch2 = false;
        for (let i = 0; i < 300; i++) {
            engine.stepSimulationFixedTicks(1);
            const elapsed = engine.gameTime - activeAbility!.startTime;
            if (elapsed > 0.25 && !passedPunch1) {
                passedPunch1 = true;
                // Verify movement still points toward A (punch1 has no movementByLabel entry).
                expect(player.movement?.path[player.movement.path.length - 1]).toEqual({ col: moveColA, row: moveRowA });
            }
            if (elapsed > 0.51 && !passedPunch2) {
                passedPunch2 = true;
                // Assert: after punch2 interval enters (0.5 s), movement path switches to B.
                expect(player.movement?.path[player.movement.path.length - 1]).toEqual({ col: moveColB, row: moveRowB });
            }
            // Stop once the ability completes so we can check damage.
            if (player.activeAbilities.length === 0) break;
        }

        expect(passedPunch1).toBe(true);
        expect(passedPunch2).toBe(true);

        // Assert: both enemies took damage.
        expect(e1.hp).toBeLessThan(100);
        expect(e2.hp).toBeLessThan(100);

        engine.destroy();
    });

    /**
     * Scenario E-preview — interactive movement re-input defers path change until interval fires.
     *
     * Preview order with base movePath toward col A. At the Target 2 pause, write
     * `active.movementByLabel['Target 2']` toward col B (same as resolveMovement). While
     * paused, movement path must still point at A; after Target 2 resolves and punch2 fires,
     * path switches to B.
     */
    it('Scenario E-preview: movementByLabel on preview cast applies at interval fire time, not while paused', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        const e1 = createTargetDummyAtWorld(engine, playerX + 42, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        const e2 = createTargetDummyAtWorld(engine, playerX, playerY + 45, { id: 'enemy_2', hp: 100 });
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        const moveColA = 2;
        const moveRowA = 5;
        const moveColB = 8;
        const moveRowB = 3;

        stepUntil(engine, () => engine.waitingForOrders != null);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            targets: [],
            targetsByLabel: {},
            endTurn: true,
            movePath: [{ col: moveColA, row: moveRowA }],
        });

        engine.stepSimulationFixedTicks(1);
        expect(player.movement?.path[player.movement.path.length - 1]).toEqual({ col: moveColA, row: moveRowA });

        const active = player.activeAbilities.find(a => a.abilityId === '0116');
        expect(active).not.toBeUndefined();

        // Resolve Target 1 and advance to Target 2 pause.
        stepUntil(engine, () => engine.waitingForTargetInput?.label === 'Target 1');
        active!.targetsByLabel!['Target 1'] = { type: 'unit', unitId: e1.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        let pausedForTarget2 = false;
        for (let i = 0; i < 120; i++) {
            engine.stepSimulationFixedTicks(1);
            const wt = engine.waitingForTargetInput as GameEngine['waitingForTargetInput'];
            if (wt?.label === 'Target 2') {
                pausedForTarget2 = true;
                break;
            }
        }
        expect(pausedForTarget2).toBe(true);

        // Movement re-input at Target 2 pause (resolveMovement writes here, not setMovement).
        if (!active!.movementByLabel) active!.movementByLabel = {};
        active!.movementByLabel['Target 2'] = { movePath: [{ col: moveColB, row: moveRowB }] };

        // While paused, path must still be A — not applied until punch2 fires.
        expect(player.movement?.path[player.movement.path.length - 1]).toEqual({ col: moveColA, row: moveRowA });

        active!.targetsByLabel!['Target 2'] = { type: 'unit', unitId: e2.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        let pathSwitchedToB = false;
        for (let i = 0; i < 120; i++) {
            engine.stepSimulationFixedTicks(1);
            const dest = player.movement?.path[player.movement.path.length - 1];
            if (dest?.col === moveColB && dest.row === moveRowB) {
                pathSwitchedToB = true;
                break;
            }
        }

        expect(pathSwitchedToB).toBe(true);
        expect(player.movement?.path[player.movement.path.length - 1]).toEqual({ col: moveColB, row: moveRowB });

        engine.destroy();
    });

    /**
     * Scenario F — Step-5 stop condition: final hit plays before engine pauses.
     *
     * Submit a preview order for Double Punch (0116) with targetsByLabel: {}.
     * Inject Target 1 and Target 2 interactively. After injecting the final target
     * the engine should:
     *   - NOT be immediately paused (resolveTarget no longer sets isPaused = true for last target)
     *   - run a few more ticks so the second punch interval fires (e2 takes damage)
     *   - then settle into isPaused = true once the caster's activeAbility ends
     *   - NOT advance to `waitingForOrders` (the round does not end in this preview)
     */
    it('Scenario F: after final target injected, engine runs final hit then pauses (not waitingForOrders)', () => {
        resetGameObjectIdCounter(1);

        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const playerX = 5 * CELL_SIZE + CELL_SIZE / 2;
        const playerY = 5 * CELL_SIZE + CELL_SIZE / 2;
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: playerX,
            y: playerY,
            abilities: ['0116'],
        });

        // e1 to the right (punch1 hits it), e2 below (punch2 hits it).
        const e1 = createTargetDummyAtWorld(engine, playerX + 42, playerY, { id: 'enemy_1', hp: 100 });
        initializeAbilityRuntimeForUnit(e1);
        engine.addUnit(e1, 'initialGameSpawn');

        const e2 = createTargetDummyAtWorld(engine, playerX, playerY + 45, { id: 'enemy_2', hp: 100 });
        initializeAbilityRuntimeForUnit(e2);
        engine.addUnit(e2, 'initialGameSpawn');

        const e2InitialHp = e2.hp;

        // Advance until waiting for orders, then queue preview order.
        stepUntil(engine, () => engine.waitingForOrders != null);

        // Mark the preview cast so the Step-5 stop condition activates.
        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = { unitId: player.id, abilityId: '0116', startRound: engine.roundNumber };

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: '0116',
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        });

        // Wait for Target 1 pause.
        stepUntil(engine, () => engine.waitingForTargetInput?.label === 'Target 1');
        expect(engine.waitingForTargetInput?.label).toBe('Target 1');

        // Inject Target 1 and unpause (simulating resolveTarget behaviour).
        const active = player.activeAbilities.find(a => a.abilityId === '0116');
        expect(active).not.toBeUndefined();
        active!.targetsByLabel!['Target 1'] = { type: 'unit', unitId: e1.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        // Wait for Target 2 pause.
        stepUntil(engine, () => engine.waitingForTargetInput?.label === 'Target 2');
        expect((engine.waitingForTargetInput as GameEngine['waitingForTargetInput'])?.label).toBe('Target 2');

        // Inject Target 2 and unpause — this simulates the new resolveTarget (Step 5):
        // always unpause, never set isPaused = true on last target.
        active!.targetsByLabel!['Target 2'] = { type: 'unit', unitId: e2.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;  // New behaviour: always unpause, even on last target.

        // Engine should NOT be immediately paused (final hit has not fired yet).
        expect(engine.isPaused).toBe(false);

        // Step forward: the second punch interval fires and e2 takes damage.
        // Then the Step-5 stop condition detects the ability ended and sets isPaused = true.
        const settled = stepUntil(engine, () => engine.isPaused, 300);
        expect(settled).toBe(true);

        // e2 must have taken damage (final hit played before the pause).
        expect(e2.hp).toBeLessThan(e2InitialHp);

        // The engine must not have reached a parallel-order pause (round did not end).
        expect(engine.waitingForOrders).toBeNull();

        engine.destroy();
    });

    /**
     * Scenario G — Light Blast playahead pauses before the active interval and damages on inject.
     */
    it('Scenario G: Light Blast playahead pauses before active interval and damages on target inject', () => {
        const { engine, player, enemy, blastPixel } = buildLightBlastFixture();
        const initialHp = enemy.hp;

        stepUntil(engine, () => engine.waitingForOrders != null);

        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: LIGHT_BLAST_ID,
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        });

        const paused = stepUntil(
            engine,
            () => engine.waitingForTargetInput?.label === 'Target',
            120,
        );
        expect(paused).toBe(true);
        expect(engine.waitingForTargetInput!.label).toBe('Target');
        expect(getCastElapsed(engine, player, LIGHT_BLAST_ID)).toBeLessThan(LIGHT_BLAST_PREFIRE);

        const active = player.activeAbilities.find(a => a.abilityId === LIGHT_BLAST_ID);
        expect(active).not.toBeUndefined();
        active!.targetsByLabel!['Target'] = { type: 'pixel', position: blastPixel };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        const { damaged } = stepUntilEnemyDamaged(
            engine,
            player,
            enemy,
            LIGHT_BLAST_ID,
            initialHp,
        );
        expect(damaged).toBe(true);
        expect(enemy.hp).toBeLessThan(initialHp);

        engine.destroy();
    });

    /**
     * Scenario H — committed and preview Light Blast paths deal damage at the same cast elapsed.
     */
    it('Scenario H: Light Blast committed and preview paths match damage timing within FIXED_DT', () => {
        const runCommitted = (): number | null => {
            const { engine, player, enemy, blastPixel } = buildLightBlastFixture();
            const initialHp = enemy.hp;

            stepUntil(engine, () => engine.waitingForOrders != null);
            engine.state.orderMgr.applyOrder({
                unitId: player.id,
                abilityId: LIGHT_BLAST_ID,
                targets: [{ type: 'pixel', position: blastPixel }],
                endTurn: true,
            });

            const { damaged, elapsedAtDamage } = stepUntilEnemyDamaged(
                engine,
                player,
                enemy,
                LIGHT_BLAST_ID,
                initialHp,
            );
            engine.destroy();
            expect(damaged).toBe(true);
            return elapsedAtDamage;
        };

        const runPreview = (): number | null => {
            const { engine, player, enemy, blastPixel } = buildLightBlastFixture();
            const initialHp = enemy.hp;

            stepUntil(engine, () => engine.waitingForOrders != null);
            engine.state.orderMgr.applyOrder({
                unitId: player.id,
                abilityId: LIGHT_BLAST_ID,
                targets: [],
                targetsByLabel: {},
                endTurn: true,
            });

            stepUntil(engine, () => engine.waitingForTargetInput?.label === 'Target', 120);

            const active = player.activeAbilities.find(a => a.abilityId === LIGHT_BLAST_ID);
            expect(active).not.toBeUndefined();
            active!.targetsByLabel!['Target'] = { type: 'pixel', position: blastPixel };
            engine.waitingForTargetInput = null;
            engine.isPaused = false;

            const { damaged, elapsedAtDamage } = stepUntilEnemyDamaged(
                engine,
                player,
                enemy,
                LIGHT_BLAST_ID,
                initialHp,
            );
            engine.destroy();
            expect(damaged).toBe(true);
            return elapsedAtDamage;
        };

        const committedElapsed = runCommitted();
        const previewElapsed = runPreview();

        expect(committedElapsed).not.toBeNull();
        expect(previewElapsed).not.toBeNull();
        expect(Math.abs(committedElapsed! - previewElapsed!)).toBeLessThanOrEqual(FIXED_DT);
    });

    /**
     * Scenario I — Swing Bat defers preview until target (windup lunge needs beginActiveCast input).
     */
    it('Scenario I: Swing Bat deferred preview pauses before cast with zero ticks advanced', () => {
        const { engine, player, aimPixel: _aimPixel } = buildSwingBatFixture();
        stepUntil(engine, () => engine.waitingForOrders != null);

        const ability = getAbility(SWING_BAT_ABILITY_ID);
        expect(ability).toBeDefined();
        expect(findPreviewDeferredSelectLabel(ability!, player, engine)).toBe(SWING_BAT_TARGET_LABEL);

        const tickAtDefer = engine.gameTick;
        engine.isSequentialTargetingPreview = true;
        engine.signalWaitingForTarget(SWING_BAT_TARGET_LABEL, player.id, SWING_BAT_ABILITY_ID);
        engine.isPaused = true;

        expect(engine.waitingForTargetInput?.label).toBe(SWING_BAT_TARGET_LABEL);
        expect(player.activeAbilities.some((a) => a.abilityId === SWING_BAT_ABILITY_ID)).toBe(false);
        expect(engine.gameTick).toBe(tickAtDefer);

        engine.destroy();
    });

    /**
     * Scenario K — full positional targets [unit, aimPixel] with 1 enemy lock-on:
     * windup lunge aims at click pixel, not the unit position.
     *
     * Regression: old code looked for aim pixel at slice(startIdx + numLockOns) which
     * missed the pixel when fewer enemies than numTargets slots were locked on.
     */
    it('Scenario K: Swing Bat with 1 enemy lock-on and trailing aim pixel lunges toward click pixel', () => {
        const { engine, player, aimPixel } = buildSwingBatFixture();

        const enemy = createTargetDummyAtWorld(engine, player.x + 20, player.y, {
            id: 'enemy_k',
            hp: 100,
        });
        initializeAbilityRuntimeForUnit(enemy);
        engine.addUnit(enemy, 'initialGameSpawn');

        stepUntil(engine, () => engine.waitingForOrders != null);

        // 1 enemy lock-on, numTargets=3 for Swing Bat → targets = [unit, aimPixel].
        const targets: ResolvedTarget[] = [
            { type: 'unit', unitId: enemy.id },
            { type: 'pixel', position: aimPixel },
        ];

        engine.isSequentialTargetingPreview = true;
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: SWING_BAT_ABILITY_ID,
            targets,
            targetsByLabel: { [SWING_BAT_TARGET_LABEL]: targets[0]! },
            endTurn: true,
        });

        const castStarted = stepUntil(
            engine,
            () => player.activeAbilities.some((a) => a.abilityId === SWING_BAT_ABILITY_ID),
            30,
        );
        expect(castStarted).toBe(true);

        const active = player.activeAbilities.find((a) => a.abilityId === SWING_BAT_ABILITY_ID);
        expect(active).toBeDefined();
        const payload = active!.castPayload as WindupLungePayload | undefined;
        expect(payload).toBeDefined();

        // Lunge must aim at the click pixel, not the lock-on unit's position.
        expect(payload!.lungeTargetX).toBeCloseTo(aimPixel.x, 0);
        expect(payload!.lungeTargetY).toBeCloseTo(aimPixel.y, 0);
        expect(payload!.lungeTargetUnitId).toBeUndefined();
        expect(payload!.effectiveLungeDistance).toBeGreaterThan(0);

        engine.destroy();
    });

    /**
     * Scenario J — preview order with positional targets runs windup lunge before the hit interval.
     */
    it('Scenario J: Swing Bat preview with positional target advances during windup lunge', () => {
        const { engine, player, aimPixel } = buildSwingBatFixture();
        const startX = player.x;
        const startY = player.y;

        stepUntil(engine, () => engine.waitingForOrders != null);

        const target: ResolvedTarget = { type: 'pixel', position: aimPixel };
        const selectLabels = [SWING_BAT_TARGET_LABEL];
        const collectedTargets = { [SWING_BAT_TARGET_LABEL]: target };

        engine.isSequentialTargetingPreview = true;
        engine.state.orderMgr.applyOrder({
            unitId: player.id,
            abilityId: SWING_BAT_ABILITY_ID,
            targets: buildPositionalTargetsFromLabels(selectLabels, collectedTargets),
            targetsByLabel: collectedTargets,
            endTurn: true,
        });

        const castStarted = stepUntil(
            engine,
            () => player.activeAbilities.some((a) => a.abilityId === SWING_BAT_ABILITY_ID),
            30,
        );
        expect(castStarted).toBe(true);

        const active = player.activeAbilities.find((a) => a.abilityId === SWING_BAT_ABILITY_ID);
        expect(active).toBeDefined();
        const payload = active!.castPayload as WindupLungePayload | undefined;
        expect(payload?.effectiveLungeDistance).toBeGreaterThan(0);

        const windupTicks = Math.ceil(SWING_BAT_WINDUP_END / FIXED_DT) - 1;
        if (windupTicks > 0) {
            engine.stepSimulationFixedTicks(windupTicks);
        }
        expect(getCastElapsed(engine, player, SWING_BAT_ABILITY_ID)).toBeLessThan(SWING_BAT_WINDUP_END);
        expect(Math.hypot(player.x - startX, player.y - startY)).toBeGreaterThan(1);

        engine.destroy();
    });
});

describe('interactive sequential targeting in-place commit', () => {
    /**
     * In-place mode contract (engine-only): preview runs to the Step-5 stop pause, then
     * clearing preview flags + unpausing reaches `waitingForOrders` without a mark restore
     * (monotonic gameTick, damage preserved). Finalized order matches rollback construction.
     */
    it('preview stop pause then in-place commit reaches waitingForOrders without restore', () => {
        const { engine, player, e1, e2 } = buildDoublePunchParityFixture();
        const markTick = engine.gameTick;

        const baseOrder: BattleOrder = {
            unitId: player.id,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            targets: [],
            endTurn: true,
        };

        const collectedTargets: Record<string, ResolvedTarget> = {
            [DOUBLE_PUNCH_TARGET_1_LABEL]: { type: 'unit', unitId: e1.id },
            [DOUBLE_PUNCH_TARGET_2_LABEL]: { type: 'unit', unitId: e2.id },
        };
        const selectLabels = [DOUBLE_PUNCH_TARGET_1_LABEL, DOUBLE_PUNCH_TARGET_2_LABEL];

        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = {
            unitId: player.id,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            startRound: engine.roundNumber,
        };

        engine.state.orderMgr.applyOrder({
            ...baseOrder,
            targetsByLabel: {},
        });

        waitForTargetLabel(engine, DOUBLE_PUNCH_TARGET_1_LABEL);
        injectInteractiveTarget(engine, player, DOUBLE_PUNCH_TARGET_1_LABEL, collectedTargets[DOUBLE_PUNCH_TARGET_1_LABEL]);

        waitForTargetLabel(engine, DOUBLE_PUNCH_TARGET_2_LABEL);
        injectInteractiveTarget(engine, player, DOUBLE_PUNCH_TARGET_2_LABEL, collectedTargets[DOUBLE_PUNCH_TARGET_2_LABEL]);

        const stopPauseReached = stepUntil(
            engine,
            () => engine.isPaused
                && !doublePunchAbilityActive(player)
                && engine.waitingForOrders == null,
            300,
        );
        expect(stopPauseReached).toBe(true);

        const tickAtStopPause = engine.gameTick;
        expect(tickAtStopPause).toBeGreaterThan(markTick);

        const e1HpAfterPreview = e1.hp;
        const e2HpAfterPreview = e2.hp;
        expect(e1HpAfterPreview).toBeLessThan(e1.maxHp);
        expect(e2HpAfterPreview).toBeLessThan(e2.maxHp);

        const finalizedOrder = buildFinalizedSequentialTargetingOrder(
            selectLabels,
            collectedTargets,
            baseOrder,
        );
        const rollbackPathOrder = buildFinalizedSequentialTargetingOrder(
            selectLabels,
            { ...collectedTargets },
            { ...baseOrder },
        );
        expect(finalizedOrder).toEqual(rollbackPathOrder);
        expect(finalizedOrder.targets).toEqual([
            collectedTargets[DOUBLE_PUNCH_TARGET_1_LABEL],
            collectedTargets[DOUBLE_PUNCH_TARGET_2_LABEL],
        ]);

        simulateInPlaceCommitEngineStep(engine);

        const reachedOrderPause = stepUntil(engine, () => engine.waitingForOrders != null, 120);
        expect(reachedOrderPause).toBe(true);
        expect(engine.gameTick).toBeGreaterThanOrEqual(tickAtStopPause);
        expect(e1.hp).toBe(e1HpAfterPreview);
        expect(e2.hp).toBe(e2HpAfterPreview);

        engine.destroy();
    });
});

describe('interactive sequential targeting fingerprint parity', () => {
    const PARITY_MOVE_COL_A = 2;
    const PARITY_MOVE_ROW_A = 5;
    const PARITY_MOVE_COL_B = 8;
    const PARITY_MOVE_ROW_B = 3;

    it('committed and interactive Double Punch runs match runtime fingerprint at the same gameTick', () => {
        const committed = runCommittedDoublePunch(buildDoublePunchParityFixture());
        const interactive = runInteractiveDoublePunch(buildDoublePunchParityFixture());
        alignEnginesToSameTick(committed, interactive);

        assertRuntimeParity(committed, interactive);

        committed.destroy();
        interactive.destroy();
    });

    it('committed and interactive Double Punch with movementByLabel match runtime fingerprint at the same gameTick', () => {
        const movementExtras: DoublePunchOrderExtras = {
            movePath: [{ col: PARITY_MOVE_COL_A, row: PARITY_MOVE_ROW_A }],
            movementByLabel: {
                [DOUBLE_PUNCH_TARGET_2_LABEL]: {
                    movePath: [{ col: PARITY_MOVE_COL_B, row: PARITY_MOVE_ROW_B }],
                },
            },
        };

        const committed = runCommittedDoublePunch(buildDoublePunchParityFixture(), movementExtras);
        const interactive = runInteractiveDoublePunch(buildDoublePunchParityFixture(), {
            movePath: movementExtras.movePath,
            movementByLabelAtTarget2Pause: movementExtras.movementByLabel![DOUBLE_PUNCH_TARGET_2_LABEL],
        });
        alignEnginesToSameTick(committed, interactive);

        assertRuntimeParity(committed, interactive);

        committed.destroy();
        interactive.destroy();
    });
});

describe('commit-time in-place decision (Step 1)', () => {
    it('isPurePassOrder accepts endTurn wait with no movement or targets', () => {
        expect(isPurePassOrder(makePurePassOrder('unit_p2'))).toBe(true);
    });

    it('isPurePassOrder rejects wait with movePath', () => {
        expect(
            isPurePassOrder({
                unitId: 'unit_p2',
                abilityId: 'wait',
                targets: [],
                endTurn: true,
                movePath: [{ col: 6, row: 5 }],
            }),
        ).toBe(false);
    });

    it('isPurePassOrder rejects real abilities', () => {
        expect(
            isPurePassOrder({
                unitId: 'unit_p2',
                abilityId: DOUBLE_PUNCH_ABILITY_ID,
                targets: [],
                endTurn: true,
            }),
        ).toBe(false);
    });

    it('(a) other waiter confirmed before begin commits in-place without restore', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, blastPixel } = fixture;
        const engine = session.getEngine()!;

        engine.state.orderMgr.applyOrder(makePurePassOrder(remoteUnitId));

        const engineBefore = session.getEngine();
        const restoreSpy = vi.spyOn(session, 'restoreFromInMemorySnapshot');
        const rewindEvents: Array<{ type: string }> = [];
        const unsubRewind = session.subscribe((ev) => {
            if (ev.type === 'sequential_targeting_rewind') rewindEvents.push(ev);
        });
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            persistCommittedOrder: vi.fn().mockResolvedValue(true),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        runLightBlastPreviewToDone(session, casterUnitId, blastPixel);

        const its = session.interactiveTargeting;
        expect(its.wouldCommitInPlace(session)).toBe(true);
        expect(its['assumedWaitUnitIds'] as Set<string>).not.toContain(remoteUnitId);

        await its.commit(session);

        expect(restoreSpy).not.toHaveBeenCalled();
        expect(session.getEngine()).toBe(engineBefore);
        expect(rewindEvents).toHaveLength(0);

        unsubRewind();
        restoreSpy.mockRestore();
        session.destroy();
    });

    it('(b) pure-pass held order mid-preview commits in-place and registers dedupe key', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, atTick, blastPixel } = fixture;
        const passOrder = makePurePassOrder(remoteUnitId);
        const passKey = hashOrderId('p2', atTick, passOrder);

        const engineBefore = session.getEngine();
        const restoreSpy = vi.spyOn(session, 'restoreFromInMemorySnapshot');
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            persistCommittedOrder: vi.fn().mockResolvedValue(true),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        runLightBlastPreviewToDone(session, casterUnitId, blastPixel);

        const its = session.interactiveTargeting;
        expect(its['assumedWaitUnitIds'] as Set<string>).toContain(remoteUnitId);
        its.holdRemoteOrder(atTick, passOrder, passKey);
        expect(its.wouldCommitInPlace(session)).toBe(true);

        const queueSpy = vi.spyOn(OrderManager.prototype, 'queueOrder');

        await its.commit(session);

        expect(restoreSpy).not.toHaveBeenCalled();
        expect(session.getEngine()).toBe(engineBefore);

        queueSpy.mockClear();
        session.applyHeldRemoteOrders([{ atTick, order: passOrder, key: passKey }]);
        expect(queueSpy).not.toHaveBeenCalled();

        queueSpy.mockRestore();
        restoreSpy.mockRestore();
        session.destroy();
    });

    it('(c) held real ability commits via rollback and applies the held order once', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, atTick, blastPixel } = fixture;
        const realOrder: BattleOrder = {
            unitId: remoteUnitId,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            targets: [],
            endTurn: true,
        };
        const realKey = hashOrderId('p2', atTick, realOrder);

        const restoreSpy = vi.spyOn(session, 'restoreFromInMemorySnapshot');
        const rewindEvents: Array<{ type: string }> = [];
        const unsubRewind = session.subscribe((ev) => {
            if (ev.type === 'sequential_targeting_rewind') rewindEvents.push(ev);
        });
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            submitOrder: vi.fn().mockResolvedValue(undefined),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        runLightBlastPreviewToDone(session, casterUnitId, blastPixel);

        const its = session.interactiveTargeting;
        its.holdRemoteOrder(atTick, realOrder, realKey);
        expect(its.wouldCommitInPlace(session)).toBe(false);

        const queueSpy = vi.spyOn(OrderManager.prototype, 'queueOrder');

        await its.commit(session);

        expect(restoreSpy).toHaveBeenCalledTimes(1);
        expect(rewindEvents).toHaveLength(1);
        expect(queueSpy).toHaveBeenCalledTimes(1);
        expect(queueSpy).toHaveBeenCalledWith(atTick, realOrder);

        unsubRewind();
        queueSpy.mockRestore();
        restoreSpy.mockRestore();
        session.destroy();
    });

    it('(d) held wait with movePath commits via rollback', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, atTick, blastPixel } = fixture;
        const moveWait: BattleOrder = {
            unitId: remoteUnitId,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
            movePath: [{ col: 6, row: 5 }],
        };
        const moveKey = hashOrderId('p2', atTick, moveWait);

        const restoreSpy = vi.spyOn(session, 'restoreFromInMemorySnapshot');
        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            submitOrder: vi.fn().mockResolvedValue(undefined),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        runLightBlastPreviewToDone(session, casterUnitId, blastPixel);

        const its = session.interactiveTargeting;
        its.holdRemoteOrder(atTick, moveWait, moveKey);
        expect(its.wouldCommitInPlace(session)).toBe(false);

        await its.commit(session);

        expect(restoreSpy).toHaveBeenCalledTimes(1);

        restoreSpy.mockRestore();
        session.destroy();
    });

    /**
     * Lobby BBA219: Light Blast preview spawned `ls_1`, rollback left a module counter at 1,
     * committed run used `ls_2` while the peer used `ls_1` → fingerprint mismatch with matching seeds.
     */
    it('Light Blast preview rollback reuses the same auto light id as a clean run from the mark', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, atTick, blastPixel } = fixture;
        const engine = session.getEngine()!;
        const mark = engine.toJSON();
        const terrain = engine.terrainManager;

        const realOrder: BattleOrder = {
            unitId: remoteUnitId,
            abilityId: DOUBLE_PUNCH_ABILITY_ID,
            targets: [],
            endTurn: true,
        };
        const realKey = hashOrderId('p2', atTick, realOrder);

        session.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            submitOrder: vi.fn().mockResolvedValue(undefined),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        runLightBlastPreviewToDone(session, casterUnitId, blastPixel);

        const its = session.interactiveTargeting;
        its.holdRemoteOrder(atTick, realOrder, realKey);
        expect(its.wouldCommitInPlace(session)).toBe(false);

        await its.commit(session);

        const afterRollback = session.getEngine()!;
        expect(afterRollback.lightSources.filter((ls) => ls.id.startsWith('ls_'))).toHaveLength(0);

        const beforeRollbackSpawn = new Set(afterRollback.lightSources.map((ls) => ls.id));
        spawnBrightLight(afterRollback, blastPixel.x, blastPixel.y, 3);
        const rollbackPathId = afterRollback.lightSources.find((ls) => !beforeRollbackSpawn.has(ls.id))?.id;
        expect(rollbackPathId).toMatch(/^ls_\d+$/);

        const clean = GameEngine.fromJSON(mark, 'p1', terrain);
        const beforeCleanSpawn = new Set(clean.lightSources.map((ls) => ls.id));
        spawnBrightLight(clean, blastPixel.x, blastPixel.y, 3);
        const cleanId = clean.lightSources.find((ls) => !beforeCleanSpawn.has(ls.id))?.id;

        expect(rollbackPathId).toBe(cleanId);

        session.destroy();
    });
});

describe('non-host in-place commit (Step 3)', () => {
    it('wouldCommitInPlace is true for non-host when persistence path and held pure passes align', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, atTick } = fixture;

        const nonHostSession = new BattleSession({
            api: makeApiStub(),
            missionId: 'dark_awakening',
            playerId: 'p2',
            isHost: false,
        });
        nonHostSession.updateLobbyContext(
            {
                p1: { id: 'p1', name: 'P1', color: '#fff' },
                p2: { id: 'p2', name: 'P2', color: '#000' },
            },
            { p1: 'warrior', p2: 'ranger' },
        );

        const engine = session.getEngine()!;
        const mark = engine.toJSON();
        mark.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();

        const its = nonHostSession.interactiveTargeting;
        its['_isActive'] = true;
        its['_abilityId'] = LIGHT_BLAST_ID;
        its['_unitId'] = casterUnitId;
        its['mark'] = mark;
        its['originalOrder'] = {
            unitId: casterUnitId,
            abilityId: LIGHT_BLAST_ID,
            targets: [],
            endTurn: true,
        };
        its['assumedWaitUnitIds'] = new Set([remoteUnitId]);
        const passOrder = makePurePassOrder(remoteUnitId);
        its.holdRemoteOrder(atTick, passOrder, hashOrderId('p1', atTick, passOrder));

        nonHostSession.setNetAdapter({
            isOrderSubmitPathAvailable: () => true,
            submitOrder: vi.fn().mockResolvedValue(undefined),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        expect(its.wouldCommitInPlace(nonHostSession)).toBe(true);

        session.destroy();
        nonHostSession.destroy();
    });
});

describe('Reset/Replay pre-restore refresh (Step 2)', () => {
    it('held order registered before reset() is pending after restore', async () => {
        const fixture = await mountLightBlastSessionFixture();
        const { session, casterUnitId, remoteUnitId, atTick } = fixture;
        const passOrder = makePurePassOrder(remoteUnitId);
        const passKey = hashOrderId('p2', atTick, passOrder);

        session.setNetAdapter({
            refreshRemoteOrdersForTargetingPreview: vi.fn().mockResolvedValue(undefined),
        } as unknown as Parameters<BattleSession['setNetAdapter']>[0]);

        const previewEngine = session.getEngine()!;
        const its = session.interactiveTargeting;

        its.begin(
            {
                unitId: casterUnitId,
                abilityId: LIGHT_BLAST_ID,
                targets: [],
                endTurn: true,
            },
            session,
        );

        const paused = stepUntil(
            previewEngine,
            () => previewEngine.waitingForTargetInput?.label === LIGHT_BLAST_TARGET_LABEL,
            120,
        );
        expect(paused).toBe(true);

        its.holdRemoteOrder(atTick, passOrder, passKey);

        await its.reset(session);

        const restoredEngine = session.getEngine()!;
        expect(its.isActive).toBe(false);
        expect(
            restoredEngine.state.orderMgr.hasPendingEndTurnOrderForUnit(remoteUnitId, atTick),
        ).toBe(true);

        session.destroy();
    });
});
