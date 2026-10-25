import { describe, expect, it, vi } from 'vitest';
import '../AbilityRegistry';
import { PulseBehaviour, pulse, pulseTotal, pulsesLandedBy } from './PulseBehaviour';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { ResolvedTarget } from '../../game/types';
import { tryDamageOrBlock } from '../blockingHelpers';

vi.mock('../blockingHelpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../blockingHelpers')>();
    return { ...actual, tryDamageOrBlock: vi.fn(actual.tryDamageOrBlock) };
});

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy'): Unit {
    return new Unit({
        id, x, y, hp: 1000, maxHp: 1000, speed: 100, teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai', characterId: 'test', name: id,
    });
}

const WINDOW = 1.4;
const cfg = { everySeconds: 0.35, windowSeconds: WINDOW };

/** Drives a behaviour through a window in `tickDt` steps, like the engine's per-tick loop. */
function runWindow(behaviour: PulseBehaviour, caster: Unit, units: Unit[], target: ResolvedTarget, tickDt = 1 / 60): void {
    const engine = {
        units, gameTime: 0, eventBus: new EventBus(),
        getUnit: (id: string) => units.find((u) => u.id === id),
    } as unknown as AbilityEngineContext;
    let prev = 0;
    for (let t = tickDt; ; t += tickDt) {
        const progress = Math.min(1, t / WINDOW);
        const ctx: CastBehaviourTickContext = {
            caster, abilityId: 'test', target, allTargets: [target], castPayload: {},
            behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
            windowProgress: progress, prevWindowProgress: prev,
            isFirstTick: prev === 0, isLastTick: progress >= 1,
        };
        behaviour.onTick(ctx);
        prev = progress;
        if (progress >= 1) break;
    }
}

describe('pulse schedule', () => {
    it('fits 4 pulses in 1.4s every 0.35s, the last exactly at the window end', () => {
        expect(pulseTotal(cfg)).toBe(4);
        expect(pulsesLandedBy(0.34, cfg)).toBe(0);
        expect(pulsesLandedBy(0.35, cfg)).toBe(1);
        expect(pulsesLandedBy(1.4, cfg)).toBe(4);
    });

    it('firstPulseAt 0 pulses immediately', () => {
        const c = { ...cfg, firstPulseAt: 0 };
        expect(pulseTotal(c)).toBe(5);
        expect(pulsesLandedBy(0, c)).toBe(1);
    });
});

describe('PulseBehaviour', () => {
    it('passes the pulse number to the damage function and hits each pulse once', () => {
        const caster = makeUnit('c', 0, 0, 'player');
        const enemy = makeUnit('e', 100, 0, 'enemy');
        const numbers: number[] = [];
        const b = pulse(cfg).withHitbox({ shape: 'circle', range: 30 }).withDamage((ctx) => {
            numbers.push(ctx.pulseNumber);
            return ctx.pulseNumber * 10;
        });
        runWindow(b, caster, [caster, enemy], { type: 'pixel', position: { x: 100, y: 0 } });
        expect(numbers).toEqual([1, 2, 3, 4]);
        expect(enemy.maxHp - enemy.hp).toBe(10 + 20 + 30 + 40);
    });

    it('lands the same pulses whatever the tick size', () => {
        const caster = makeUnit('c', 0, 0, 'player');
        const enemy = makeUnit('e', 100, 0, 'enemy');
        const b = pulse(cfg).withHitbox({ shape: 'circle', range: 30 }).withDamage(1);
        runWindow(b, caster, [caster, enemy], { type: 'pixel', position: { x: 100, y: 0 } }, 0.2);
        expect(enemy.maxHp - enemy.hp).toBe(4);
    });

    it('centres on the origin, not the caster, and misses units outside the hitbox', () => {
        const caster = makeUnit('c', 0, 0, 'player');
        const near = makeUnit('n', 100, 0, 'enemy');
        const far = makeUnit('f', 400, 0, 'enemy');
        const b = pulse(cfg).withHitbox({ shape: 'circle', range: 30 }).withDamage(5);
        runWindow(b, caster, [caster, near, far], { type: 'pixel', position: { x: 100, y: 0 } });
        expect(near.hp).toBe(near.maxHp - 20);
        expect(far.hp).toBe(far.maxHp);
    });

    it('goes through tryDamageOrBlock, with the pulse origin as the attack source', () => {
        const caster = makeUnit('c', 0, 0, 'player');
        const enemy = makeUnit('e', 100, 0, 'enemy');
        vi.mocked(tryDamageOrBlock).mockClear();
        const b = pulse(cfg).withHitbox({ shape: 'circle', range: 30 }).withDamage(5);
        runWindow(b, caster, [caster, enemy], { type: 'pixel', position: { x: 100, y: 0 } });
        expect(tryDamageOrBlock).toHaveBeenCalledTimes(4);
        expect(tryDamageOrBlock).toHaveBeenCalledWith(enemy, expect.objectContaining({ attackerX: 100, attackerY: 0, damage: 5, attackType: 'melee' }));
    });

    it('calls onPulse once per pulse even with no hits', () => {
        const caster = makeUnit('c', 0, 0, 'player');
        const seen: number[] = [];
        const b = new PulseBehaviour(cfg).withHitbox({ shape: 'circle', range: 30 }).onPulse((ctx, hits) => {
            seen.push(ctx.pulseNumber + hits.length * 100);
        });
        runWindow(b, caster, [caster], { type: 'pixel', position: { x: 100, y: 0 } });
        expect(seen).toEqual([1, 2, 3, 4]);
    });
});
