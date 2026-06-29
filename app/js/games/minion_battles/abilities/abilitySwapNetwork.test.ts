/**
 * Swap network unit tests.
 *
 * Covers the state machine that activates and deactivates abilities via the
 * swap network (evaluateSwapTriggers / activateSwappedAbility / deactivateSwappedAbility).
 *
 * The four scenarios below operate directly on Unit runtime state — no
 * SimulationRunner required.  The tiny engine harness provides a real Unit
 * so that addBuff / consumeAbilityUse integrate with the same code paths
 * that run in the live game.
 */

import { describe, it, expect } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { LightImbueBuff } from '../buffs/LightImbueBuff';
import { consumeAbilityUse, ensureAbilityRuntimeState } from './abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

/**
 * All three ability IDs involved in the swap:
 *   0115 — Swing Bat (the base ability that gets replaced)
 *   0802 — Light Imbuement (casts the buff that fires the swap trigger)
 *   0803 — Imbued Bat (the swap-network ability; starts hidden)
 */
const ABILITIES = ['0115', '0802', '0803'] as const;

function buildTestEngine() {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: PLAYER_POS.x,
        y: PLAYER_POS.y,
        abilities: [...ABILITIES],
    });
    return { engine, player };
}

// ---------------------------------------------------------------------------
// Scenario A — abilities with swapConfig start as active: false
// ---------------------------------------------------------------------------

describe('Swap Network — Scenario A: hidden on init', () => {
    it('0803 (Imbued Bat) starts inactive', () => {
        const { player } = buildTestEngine();
        ensureAbilityRuntimeState(player, '0803');
        expect(player.abilityRuntime['0803']?.active).toBe(false);
    });

    it('0115 (Swing Bat) starts active', () => {
        const { player } = buildTestEngine();
        ensureAbilityRuntimeState(player, '0115');
        expect(player.abilityRuntime['0115']?.active).toBe(true);
    });

    it('0802 (Light Imbuement) starts active (no swapConfig)', () => {
        const { player } = buildTestEngine();
        ensureAbilityRuntimeState(player, '0802');
        expect(player.abilityRuntime['0802']?.active).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Scenario B — swap fires on buff: addBuff triggers the evaluator
// ---------------------------------------------------------------------------

describe('Swap Network — Scenario B: swap fires on buff', () => {
    it('applying LightImbueBuff hides Swing Bat and activates Imbued Bat', () => {
        const { engine, player } = buildTestEngine();

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0115']?.active).toBe(false);
        expect(player.abilityRuntime['0803']?.active).toBe(true);
    });

    it('Imbued Bat records replacedAbilityId = 0115 after activation', () => {
        const { engine, player } = buildTestEngine();

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0803']?.replacedAbilityId).toBe('0115');
    });

    it('Imbued Bat has currentUses = 1 after activation (usesOnActivation)', () => {
        const { engine, player } = buildTestEngine();

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0803']?.currentUses).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Scenario C — swap restores on exhaust: consumeAbilityUse fires deactivate
// ---------------------------------------------------------------------------

describe('Swap Network — Scenario C: swap restores on exhaust', () => {
    function buildActivatedEngine() {
        const { engine, player } = buildTestEngine();
        // Trigger the swap
        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);
        // Exhaust the ability (currentUses was 1 → 0 → deactivate)
        consumeAbilityUse(player, '0803');
        return { engine, player };
    }

    it('Imbued Bat is inactive after being exhausted', () => {
        const { player } = buildActivatedEngine();
        expect(player.abilityRuntime['0803']?.active).toBe(false);
    });

    it('Imbued Bat has replacedAbilityId = null after deactivation', () => {
        const { player } = buildActivatedEngine();
        expect(player.abilityRuntime['0803']?.replacedAbilityId).toBe(null);
    });

    it('Swing Bat is restored to active after Imbued Bat deactivates', () => {
        const { player } = buildActivatedEngine();
        expect(player.abilityRuntime['0115']?.active).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Scenario D — guard: no swap if replaced ability is already inactive
// ---------------------------------------------------------------------------

describe('Swap Network — Scenario D: guard against double-swap', () => {
    it('does not activate Imbued Bat when Swing Bat is already inactive', () => {
        const { engine, player } = buildTestEngine();

        // Manually hide Swing Bat (simulate it already being swapped out)
        ensureAbilityRuntimeState(player, '0115');
        player.abilityRuntime['0115']!.active = false;

        // Apply the buff — evaluator should NOT activate 0803 (guard fires)
        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0803']?.active).toBe(false);
        expect(player.abilityRuntime['0803']?.replacedAbilityId).toBe(null);
    });
});
