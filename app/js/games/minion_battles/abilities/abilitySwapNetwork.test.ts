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

import { describe, it, expect, beforeAll } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { LightImbueBuff } from '../buffs/LightImbueBuff';
import { consumeAbilityUse, ensureAbilityRuntimeState } from './abilityUses';
import { defineAbility } from './defineAbility';
import { AbilityPhase } from './abilityTimings';
import { registerAbilityForTest } from './AbilityRegistry';
import type { AbilityStatic } from './Ability';
import { GameEngine } from '../game/GameEngine';
import { FIXED_DT } from '../game/gameConstants';
import { executeUnitAbility } from '../game/units/unitAbilityLifecycle';
import type { Unit } from '../game/units/Unit';
import { Water } from '../resources/Water';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

/**
 * All three ability IDs involved in the swap:
 *   0115 — Swing Mace (the base ability that gets replaced)
 *   0804 — Gather Light (casts LightImbueBuff when Light Imbuement is researched)
 *   0803 — Imbued Mace (the swap-network ability; starts hidden)
 */
const ABILITIES = ['0115', '0804', '0803'] as const;

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
    it('0803 (Imbued Mace) starts inactive', () => {
        const { player } = buildTestEngine();
        ensureAbilityRuntimeState(player, '0803');
        expect(player.abilityRuntime['0803']?.active).toBe(false);
    });

    it('0115 (Swing Mace) starts active', () => {
        const { player } = buildTestEngine();
        ensureAbilityRuntimeState(player, '0115');
        expect(player.abilityRuntime['0115']?.active).toBe(true);
    });

    it('0804 (Gather Light) starts active (no swapConfig)', () => {
        const { player } = buildTestEngine();
        ensureAbilityRuntimeState(player, '0804');
        expect(player.abilityRuntime['0804']?.active).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Scenario B — swap fires on buff: addBuff triggers the evaluator
// ---------------------------------------------------------------------------

describe('Swap Network — Scenario B: swap fires on buff', () => {
    it('applying LightImbueBuff hides Swing Mace and activates Imbued Mace', () => {
        const { engine, player } = buildTestEngine();

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0115']?.active).toBe(false);
        expect(player.abilityRuntime['0803']?.active).toBe(true);
    });

    it('Imbued Mace records replacedAbilityId = 0115 after activation', () => {
        const { engine, player } = buildTestEngine();

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0803']?.replacedAbilityId).toBe('0115');
    });

    it('Imbued Mace has currentUses = 1 after activation (usesOnActivation)', () => {
        const { engine, player } = buildTestEngine();

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0803']?.currentUses).toBe(1);
    });

    it('Imbued Mace occupies Swing Mace bar slot after activation', () => {
        const { engine, player } = buildTestEngine();
        const swingBatSlot = player.abilities.indexOf('0115');
        const imbuedBatSlot = player.abilities.indexOf('0803');
        expect(swingBatSlot).toBeGreaterThanOrEqual(0);
        expect(imbuedBatSlot).toBeGreaterThan(swingBatSlot);

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilities.indexOf('0803')).toBe(swingBatSlot);
        expect(player.abilities.indexOf('0115')).toBe(imbuedBatSlot);
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

    it('Imbued Mace is inactive after being exhausted', () => {
        const { player } = buildActivatedEngine();
        expect(player.abilityRuntime['0803']?.active).toBe(false);
    });

    it('Imbued Mace has replacedAbilityId = null after deactivation', () => {
        const { player } = buildActivatedEngine();
        expect(player.abilityRuntime['0803']?.replacedAbilityId).toBe(null);
    });

    it('Swing Mace is restored to active after Imbued Mace deactivates', () => {
        const { player } = buildActivatedEngine();
        expect(player.abilityRuntime['0115']?.active).toBe(true);
    });

    it('bar slot order is restored after Imbued Mace deactivates', () => {
        const { engine, player } = buildTestEngine();
        const swingBatSlot = player.abilities.indexOf('0115');
        const imbuedBatSlot = player.abilities.indexOf('0803');

        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);
        consumeAbilityUse(player, '0803');

        expect(player.abilities.indexOf('0115')).toBe(swingBatSlot);
        expect(player.abilities.indexOf('0803')).toBe(imbuedBatSlot);
    });
});

// ---------------------------------------------------------------------------
// Scenario D — guard: no swap if replaced ability is already inactive
// ---------------------------------------------------------------------------

describe('Swap Network — Scenario D: guard against double-swap', () => {
    it('does not activate Imbued Mace when Swing Mace is already inactive', () => {
        const { engine, player } = buildTestEngine();

        // Manually hide Swing Mace (simulate it already being swapped out)
        ensureAbilityRuntimeState(player, '0115');
        player.abilityRuntime['0115']!.active = false;

        // Apply the buff — evaluator should NOT activate 0803 (guard fires)
        player.addBuff(new LightImbueBuff(), engine.gameTime, engine.roundNumber ?? 1);

        expect(player.abilityRuntime['0803']?.active).toBe(false);
        expect(player.abilityRuntime['0803']?.replacedAbilityId).toBe(null);
    });
});

// ---------------------------------------------------------------------------
// Scenario E — `whileCastable`: the swap ability holds the slot while it can be cast
// ---------------------------------------------------------------------------

const WC_BASE_ID = 'test_while_castable_base';
const WC_SWAP_ID = 'test_while_castable_swap';
const WC_COST = 3;
const WC_USES = 2;
const WC_CAST_SECONDS = 0.5;

function wcAbility(overrides: Partial<AbilityStatic> & Pick<AbilityStatic, 'id' | 'name'>): AbilityStatic {
    return defineAbility({
        image: '',
        resourceCost: null,
        rechargeTurns: 0,
        prefireTime: 0,
        targets: [],
        abilityTimings: [
            { id: 'active', start: 0, end: WC_CAST_SECONDS, abilityPhase: AbilityPhase.Active, castBehaviours: [] },
        ],
        getTooltipText: () => [overrides.name],
        getRange: () => ({ minRange: 0, maxRange: 100 }),
        ...overrides,
    });
}

const WcBaseAbility = wcAbility({ id: WC_BASE_ID, name: 'Base Card' });
const WcSwapAbility = wcAbility({
    id: WC_SWAP_ID,
    name: 'Swap Card',
    maxUses: WC_USES,
    resourceCost: { resourceId: 'water', amount: WC_COST },
    swapConfig: {
        activateTrigger: { type: 'whileCastable' },
        deactivateTrigger: { type: 'whileCastable' },
        replacesAbilityId: WC_BASE_ID,
    },
});

/** Steps the engine like a live battle (UnitManager tick, natural cast completion). */
function stepTicks(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        engine.isPaused = false;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

const CAST_TICKS = Math.ceil(WC_CAST_SECONDS / FIXED_DT) + 2;

function buildWhileCastableEngine(startWater = 0) {
    const engine = buildTinyBattleEngine({ gridW: 8, gridH: 8, localPlayerId: P, grass: true });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: PLAYER_POS.x,
        y: PLAYER_POS.y,
        abilities: [WC_BASE_ID, '0804', WC_SWAP_ID],
    });
    const water = new Water();
    water.current = startWater;
    player.attachResource(water, engine.eventBus);
    let barEvents = 0;
    engine.eventBus.on('ability_bar_changed', () => { barEvents++; });
    return { engine, player, water, barEvents: () => barEvents };
}

function isSwappedIn(player: Unit): boolean {
    return player.abilityRuntime[WC_SWAP_ID]?.active === true
        && player.abilityRuntime[WC_BASE_ID]?.active === false
        && player.abilities.indexOf(WC_SWAP_ID) === 0;
}

function isSwappedOut(player: Unit): boolean {
    return player.abilityRuntime[WC_SWAP_ID]?.active === false
        && player.abilityRuntime[WC_BASE_ID]?.active === true
        && player.abilities.indexOf(WC_BASE_ID) === 0
        && player.abilityRuntime[WC_SWAP_ID]?.replacedAbilityId === null;
}

describe('Swap Network — Scenario E: whileCastable', () => {
    beforeAll(() => {
        registerAbilityForTest(WcBaseAbility);
        registerAbilityForTest(WcSwapAbility);
    });

    it('stays hidden while the cost cannot be paid', () => {
        const { engine, player, barEvents } = buildWhileCastableEngine(WC_COST - 1);
        stepTicks(engine, 5);
        expect(isSwappedOut(player)).toBe(true);
        expect(barEvents()).toBe(0);
    });

    it('swaps into the replaced slot once affordable, keeping its own uses', () => {
        const { engine, player, water } = buildWhileCastableEngine(0);
        stepTicks(engine, 1);
        expect(isSwappedOut(player)).toBe(true);

        water.current = WC_COST;
        stepTicks(engine, 1);

        expect(isSwappedIn(player)).toBe(true);
        expect(player.abilityRuntime[WC_SWAP_ID]?.replacedAbilityId).toBe(WC_BASE_ID);
        expect(player.abilityRuntime[WC_SWAP_ID]?.currentUses).toBe(WC_USES);
    });

    it('gives the slot back when the resource drops below cost', () => {
        const { engine, player, water } = buildWhileCastableEngine(WC_COST);
        stepTicks(engine, 1);
        expect(isSwappedIn(player)).toBe(true);

        water.current = WC_COST - 0.5;
        stepTicks(engine, 1);
        expect(isSwappedOut(player)).toBe(true);
    });

    it('gives the slot back once its uses hit 0, after the last cast ends, and returns at round start', () => {
        const { engine, player } = buildWhileCastableEngine(16);
        stepTicks(engine, 1);
        expect(isSwappedIn(player)).toBe(true);

        executeUnitAbility(player, WcSwapAbility, [], engine);
        stepTicks(engine, CAST_TICKS);
        expect(player.abilityRuntime[WC_SWAP_ID]?.currentUses).toBe(WC_USES - 1);
        expect(isSwappedIn(player)).toBe(true);

        executeUnitAbility(player, WcSwapAbility, [], engine);
        expect(player.abilityRuntime[WC_SWAP_ID]?.currentUses).toBe(0);
        stepTicks(engine, 2);
        // Mid-cast: the slot is left alone.
        expect(player.activeAbilities.some((a) => a.abilityId === WC_SWAP_ID)).toBe(true);
        expect(isSwappedIn(player)).toBe(true);

        stepTicks(engine, CAST_TICKS);
        expect(player.activeAbilities.length).toBe(0);
        expect(isSwappedOut(player)).toBe(true);

        // Round start refills uses; the swap settles there without waiting for a tick.
        player.onRoundStart(engine.roundNumber + 1, engine);
        expect(isSwappedIn(player)).toBe(true);
    });

    it('does not swap out mid-cast when the cast spends the last of the resource', () => {
        const { engine, player, water } = buildWhileCastableEngine(WC_COST);
        stepTicks(engine, 1);
        expect(isSwappedIn(player)).toBe(true);

        executeUnitAbility(player, WcSwapAbility, [], engine);
        expect(water.current).toBe(0);
        stepTicks(engine, 2);
        expect(isSwappedIn(player)).toBe(true);

        stepTicks(engine, CAST_TICKS);
        expect(isSwappedOut(player)).toBe(true);
    });

    it('does not swap in while the replaced card is mid-cast', () => {
        const { engine, player, water } = buildWhileCastableEngine(0);
        executeUnitAbility(player, WcBaseAbility, [], engine);
        water.current = WC_COST;
        stepTicks(engine, 2);
        expect(isSwappedOut(player)).toBe(true);

        stepTicks(engine, CAST_TICKS);
        expect(player.activeAbilities.length).toBe(0);
        expect(isSwappedIn(player)).toBe(true);
    });

    it('emits ability_bar_changed once per swap, never on a steady state', () => {
        const { engine, water, barEvents } = buildWhileCastableEngine(0);
        stepTicks(engine, 10);
        expect(barEvents()).toBe(0);

        water.current = WC_COST;
        stepTicks(engine, 30);
        expect(barEvents()).toBe(1);

        water.current = 0;
        stepTicks(engine, 30);
        expect(barEvents()).toBe(2);
    });

    it('keeps the swapped-in slot across a checkpoint round trip', () => {
        const { engine, player } = buildWhileCastableEngine(WC_COST);
        stepTicks(engine, 1);
        expect(isSwappedIn(player)).toBe(true);
        const barBefore = [...player.abilities];

        const restored = GameEngine.fromJSON(
            JSON.parse(JSON.stringify(engine.toJSON())),
            TINY_BATTLE_PLAYER_ID,
            engine.terrainManager,
        );
        const restoredPlayer = restored.units.find((u) => u.id === player.id)!;
        expect(restoredPlayer.getResource('water')?.current).toBe(WC_COST);
        expect(restoredPlayer.abilities).toEqual(barBefore);
        expect(isSwappedIn(restoredPlayer)).toBe(true);

        let restoredBarEvents = 0;
        restored.eventBus.on('ability_bar_changed', () => { restoredBarEvents++; });
        stepTicks(restored, 5);
        expect(isSwappedIn(restoredPlayer)).toBe(true);
        expect(restoredBarEvents).toBe(0);
    });
});
