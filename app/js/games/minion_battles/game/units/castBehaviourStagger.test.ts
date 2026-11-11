/**
 * A cast behaviour entry starts at its own `timingStart`, not when its interval opens: one-shot entries
 * with numeric / '%' offsets inside one interval fire staggered (e.g. Fling Thorns' thorns).
 */
import { beforeAll, describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import { getAbility, registerAbilityForTest } from '../../abilities/AbilityRegistry';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { defineAbility } from '../../abilities/defineAbility';
import { ensureAbilityRuntimeState } from '../../abilities/abilityUses';
import { FIXED_DT } from '../gameConstants';
import type { GameEngine } from '../GameEngine';
import type { ResolvedTarget } from '../types';
import { executeUnitAbility } from './unitAbilityLifecycle';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import { buildTinyBattleEngine, placePlayerFromLoadout, TINY_BATTLE_PLAYER_ID } from '../../testing/harness/buildTinyBattleEngine';
import { FLING_THORN_ABILITY_ID, FLING_THORN_COUNT } from '../../card_defs/07_command_core/0705_FlingThorn/0705Ability';

const STAGGER_ID = '0598';
const fired: { label: string; at: number }[] = [];
let castStart = 0;

const Stagger = defineAbility({
    id: STAGGER_ID,
    name: 'Stagger Test',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0.2,
    targets: [],
    abilityTimings: [
        { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
        {
            id: 'fire',
            start: 0.2,
            end: 1.0,
            abilityPhase: AbilityPhase.Active,
            castBehaviours: [
                { timingStart: 'start', behaviour: CastBehaviours.Instant((ctx) => { fired.push({ label: 'start', at: ctx.engine.gameTime - castStart }); }) },
                { timingStart: 0.3, behaviour: CastBehaviours.Instant((ctx) => { fired.push({ label: '0.3', at: ctx.engine.gameTime - castStart }); }) },
                { timingStart: '50%', behaviour: CastBehaviours.Instant((ctx) => { fired.push({ label: '50%', at: ctx.engine.gameTime - castStart }); }) },
            ],
        },
    ],
    getRange: () => ({ minRange: 0, maxRange: 0 }),
    getTooltipText: () => [],
});

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    const ticks = Math.ceil(seconds / FIXED_DT);
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

function battle(abilityId: string) {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    player.abilities.push(abilityId);
    ensureAbilityRuntimeState(player, abilityId);
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player };
}

describe('cast behaviour timingStart offsets', () => {
    beforeAll(() => registerAbilityForTest(Stagger));

    it('starts each one-shot entry when its own start time is reached', () => {
        fired.length = 0;
        const { engine, player } = battle(STAGGER_ID);
        castStart = engine.gameTime;
        executeUnitAbility(player, Stagger, [], engine);
        step(engine, 1.2);

        expect(fired.map((f) => f.label)).toEqual(['start', '0.3', '50%']);
        const at = Object.fromEntries(fired.map((f) => [f.label, f.at]));
        expect(at['start']).toBeCloseTo(0.2, 1);
        expect(at['0.3']).toBeCloseTo(0.5, 1);
        expect(at['50%']).toBeCloseTo(0.6, 1);
    });

    it('Fling Thorns launches its thorns one at a time, not all on one tick', () => {
        const { engine, player } = battle(FLING_THORN_ABILITY_ID);
        const ability = getAbility(FLING_THORN_ABILITY_ID)!;
        const aim: ResolvedTarget = { type: 'pixel', position: { x: 350, y: 200 } };
        executeUnitAbility(player, ability, [aim], engine);

        const counts: number[] = [];
        step(engine, 2.0, () => counts.push(engine.projectiles.length));
        const peak = Math.max(...counts);
        expect(peak).toBeGreaterThan(0);
        // Every thorn-count change is a single new thorn.
        const increases = counts.map((c, i) => c - (counts[i - 1] ?? 0)).filter((d) => d > 0);
        expect(increases.every((d) => d === 1)).toBe(true);
        expect(increases.reduce((a, b) => a + b, 0)).toBe(FLING_THORN_COUNT);
    });
});
