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
 * Scenario C: A normal order (no targetsByLabel) never sets waitingForTargetInput.
 */

import { describe, it, expect } from 'vitest';
import { resetGameObjectIdCounter } from './GameObject';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';

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
            if (engine.waitingForTargetInput?.label === 'Target 2') {
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
});
