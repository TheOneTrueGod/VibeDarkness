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
 */

import { describe, it, expect } from 'vitest';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { GameEngine } from './GameEngine';
import type { Unit } from './units/Unit';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { Light } from '../resources/Light';

/** Matches `GameEngine` fixed timestep. */
const FIXED_DT = 1 / 60;
/** Matches `0801Ability` `PREFIRE_TIME`. */
const LIGHT_BLAST_ID = '0801';
const LIGHT_BLAST_PREFIRE = 0.4;
/** Matches `0801Ability` `resourceCost.amount`. */
const LIGHT_BLAST_LIGHT_COST = 2;

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

        // Verify punch1 fired and e1 took damage (waitingForTargetIntervals for punch1 cleared).
        expect(active!.waitingForTargetIntervals?.has('punch1')).toBeFalsy();

        // ── Resolve Target 2 ──
        active!.targetsByLabel!['Target 2'] = { type: 'unit', unitId: e2.id };
        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        // Verify punch2 is still in waitingForTargetIntervals (it was blocked in Pass A).
        expect(active!.waitingForTargetIntervals?.has('punch2')).toBe(true);

        // ── Advance until the ability completes ──
        // Step tick by tick so we can detect when punch2's interval has been cleared from waiting.
        let punch2WaitCleared = false;
        for (let i = 0; i < 300; i++) {
            engine.stepSimulationFixedTicks(1);
            // After Pass B fires for punch2, it's removed from waitingForTargetIntervals.
            if (active!.waitingForTargetIntervals?.has('punch2') === false) {
                punch2WaitCleared = true;
            }
            if (player.activeAbilities.length === 0) break;
        }

        // Both enemies should have taken damage from their respective punches.
        expect(e1.hp).toBeLessThan(e1InitialHp);
        expect(punch2WaitCleared).toBe(true);
        expect(e2.hp).toBeLessThan(e2InitialHp);

        engine.destroy();
    });

    /**
     * Scenario C — non-interactive ability is completely unaffected.
     *
     * Submit a normal ability order for 0120 (PunchNEW) WITHOUT targetsByLabel set.
     * Pass A is a no-op when targetsByLabel is undefined, so waitingForTargetInput
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

        // Submit a normal (non-preview) order — no targetsByLabel means Pass A is a no-op.
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
});
