/**
 * Unit tests for the Step 9 cast-behaviour building blocks: CasterSlide, CasterShake, Instant
 * `at` option, and held ProjectileLaunch. Behaviours are driven with hand-built contexts, so no
 * battle engine is needed.
 */
import { describe, it, expect, vi } from 'vitest';
// Load the registry first: ThrowRock calls CastBehaviours at module load, and importing the
// CastBehaviours index cold starts a cycle (index -> BaseAttackBehaviour -> Unit -> ... -> registry -> ThrowRock).
// Other CastBehaviours tests use the same registry-first order.
import '../AbilityRegistry';
import { CastBehaviours } from './index';
import { ProjectileLaunchBehaviour } from './ProjectileLaunchBehaviour';
import { casterSlideMagnitude } from './CasterSlideBehaviour';
import type {
    CastBehaviourInterruptContext,
    CastBehaviourRenderContext,
    CastBehaviourSetupContext,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import type { Projectile } from '../../game/projectiles/Projectile';

const ABILITY_ID = 'test_ability';

const caster = { id: 'caster_1', teamId: 'player', x: 0, y: 0, radius: 10 } as unknown as Unit;

const pixelTarget = { type: 'pixel', position: { x: 200, y: 0 } } as ResolvedTarget;

/**
 * Engine stub exposing only what ProjectileLaunch and the interrupt path touch.
 * Like `GameEngine.addProjectile`, it reassigns the projectile's id on add, so a behaviour that
 * captures the id before adding would look up a stale id.
 */
function makeEngine(): { engine: AbilityEngineContext; projectiles: Projectile[] } {
    const projectiles: Projectile[] = [];
    let nextId = 1;
    const engine = {
        projectiles,
        addProjectile: (p: Projectile) => {
            p.id = `proj_engine_${nextId++}`;
            projectiles.push(p);
        },
        getUnit: () => undefined,
        units: [],
        addEffect: () => {},
        addEffectEmitter: () => {},
        gameTime: 0,
    } as unknown as AbilityEngineContext;
    return { engine, projectiles };
}

/** Setup context that records the payload the behaviour writes. */
function makeSetupCtx(engine: AbilityEngineContext): { ctx: CastBehaviourSetupContext; getPayload: () => unknown } {
    let payload: unknown = undefined;
    const ctx: CastBehaviourSetupContext = {
        caster,
        abilityId: ABILITY_ID,
        target: pixelTarget,
        allTargets: [pixelTarget],
        castPayload: {},
        behaviourPayload: undefined,
        setBehaviourPayload: (data) => {
            payload = data;
        },
        engine,
    };
    return { ctx, getPayload: () => payload };
}

function makeTickCtx(
    engine: AbilityEngineContext,
    behaviourPayload: unknown,
    overrides: Partial<CastBehaviourTickContext> = {},
): CastBehaviourTickContext {
    return {
        caster,
        abilityId: ABILITY_ID,
        target: pixelTarget,
        allTargets: [pixelTarget],
        castPayload: {},
        behaviourPayload,
        setBehaviourPayload: () => {},
        engine,
        windowProgress: 0,
        prevWindowProgress: 0,
        isFirstTick: false,
        isLastTick: false,
        ...overrides,
    };
}

function makeInterruptCtx(engine: AbilityEngineContext, behaviourPayload: unknown): CastBehaviourInterruptContext {
    return {
        caster,
        abilityId: ABILITY_ID,
        target: pixelTarget,
        allTargets: [pixelTarget],
        castPayload: {},
        behaviourPayload,
        setBehaviourPayload: () => {},
        engine,
    };
}

function makeRenderCtx(engine: AbilityEngineContext, windowProgress: number, gameTime = 0): CastBehaviourRenderContext {
    return {
        caster,
        abilityId: ABILITY_ID,
        target: pixelTarget,
        allTargets: [pixelTarget],
        castPayload: {},
        behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine,
        gameTime,
        windowProgress,
    };
}

describe('casterSlideMagnitude', () => {
    it('is continuous at the window start when impactAt is 0', () => {
        // Back phase starts at +forwardDistance, so there is no snap when impactAt = 0.
        expect(casterSlideMagnitude(0, 0, 10, 4)).toBeCloseTo(10);
    });
});

describe('CastBehaviours.CasterSlide', () => {
    const slide = CastBehaviours.CasterSlide({
        forwardDistance: 10,
        backwardDistance: 4,
        impactAt: 0.5,
        direction: () => ({ x: 1, y: 0 }),
    });

    it('offsets the caster 0 at window start, forward at impact, and back at window end', () => {
        const { engine } = makeEngine();
        const atStart = slide.getCasterRenderOffset!(makeRenderCtx(engine, 0));
        const atImpact = slide.getCasterRenderOffset!(makeRenderCtx(engine, 0.5));
        const atEnd = slide.getCasterRenderOffset!(makeRenderCtx(engine, 1));

        expect(atStart!.x).toBeCloseTo(0);
        expect(atStart!.y).toBeCloseTo(0);
        expect(atImpact!.x).toBeCloseTo(10);
        expect(atImpact!.y).toBeCloseTo(0);
        expect(atEnd!.x).toBeCloseTo(-4);
        expect(atEnd!.y).toBeCloseTo(0);
    });

    it('keeps the direction captured when its window opened, even if the live direction changes', () => {
        let live = { x: 1, y: 0 };
        const captured = CastBehaviours.CasterSlide({
            forwardDistance: 10,
            backwardDistance: 4,
            impactAt: 0.5,
            direction: () => live,
        });
        const { engine } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        captured.onSetup!(ctx);
        live = { x: -1, y: 0 };

        const offset = captured.getCasterRenderOffset!({ ...makeRenderCtx(engine, 0.5), behaviourPayload: getPayload() });
        expect(offset!.x).toBeCloseTo(10);
    });

    it('returns null when the direction callback returns null', () => {
        const none = CastBehaviours.CasterSlide({
            forwardDistance: 10,
            backwardDistance: 4,
            impactAt: 0.5,
            direction: () => null,
        });
        const { engine } = makeEngine();
        expect(none.getCasterRenderOffset!(makeRenderCtx(engine, 0.5))).toBeNull();
    });
});

describe('CastBehaviours.CasterShake', () => {
    it('ramps amplitude with window progress and is a pure function of game time', () => {
        const shake = CastBehaviours.CasterShake({ from: 1, to: 3 });
        const { engine } = makeEngine();

        const once = shake.getCasterRenderOffset!(makeRenderCtx(engine, 1, 2.5));
        const again = shake.getCasterRenderOffset!(makeRenderCtx(engine, 1, 2.5));
        expect(again).toEqual(once);

        // At progress 1 the amplitude is `to` (3), so x is sin(gameTime * 90) * 3.
        expect(once!.x).toBeCloseTo(Math.sin(2.5 * 90) * 3);
        expect(once!.y).toBeCloseTo(Math.cos(2.5 * 110) * 3 * 0.6);
    });

    it('is still at progress 0 when `from` is 0', () => {
        const shake = CastBehaviours.CasterShake({ from: 0, to: 4 });
        const { engine } = makeEngine();
        const o = shake.getCasterRenderOffset!(makeRenderCtx(engine, 0, 1.7));
        expect(o!.x).toBeCloseTo(0);
        expect(o!.y).toBeCloseTo(0);
    });
});

describe('CastBehaviours.Instant', () => {
    it('defaults to firing once on the first tick', () => {
        const { engine } = makeEngine();
        const fn = vi.fn();
        const behaviour = CastBehaviours.Instant(fn);

        behaviour.onTick(makeTickCtx(engine, undefined, { isFirstTick: true }));
        behaviour.onTick(makeTickCtx(engine, undefined));
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('with { at: "end" } fires once on the last tick and not on the first', () => {
        const { engine } = makeEngine();
        const fn = vi.fn();
        const behaviour = CastBehaviours.Instant(fn, { at: 'end' });

        behaviour.onTick(makeTickCtx(engine, undefined, { isFirstTick: true }));
        behaviour.onTick(makeTickCtx(engine, undefined));
        expect(fn).not.toHaveBeenCalled();

        behaviour.onTick(makeTickCtx(engine, undefined, { isLastTick: true, windowProgress: 1 }));
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe('ProjectileLaunch held state', () => {
    const origin = { x: 100, y: 50 };
    const along = { x: 1, y: 0 };

    it('spawns held at the origin and does not move', () => {
        const { engine, projectiles } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        const behaviour = new ProjectileLaunchBehaviour()
            .withOrigin(() => origin)
            .withDirection(() => along)
            .withMaxRange(120)
            .withHold();

        behaviour.onSetup(ctx);

        expect(projectiles).toHaveLength(1);
        const projectile = projectiles[0]!;
        expect(projectile.isHeld).toBe(true);
        expect(projectile.heldBy).toEqual({ unitId: caster.id, abilityId: ABILITY_ID });
        expect(projectile.x).toBe(origin.x);
        expect(projectile.y).toBe(origin.y);
        expect(projectile.velocityX).toBe(0);
        expect(projectile.velocityY).toBe(0);
        expect(getPayload()).toMatchObject({ projectileId: projectile.id, dirX: 1, dirY: 0 });
    });

    it('stays held on a mid-window tick', () => {
        const { engine, projectiles } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        const behaviour = new ProjectileLaunchBehaviour()
            .withOrigin(() => origin)
            .withDirection(() => along)
            .withHold();
        behaviour.onSetup(ctx);

        behaviour.onTick!(makeTickCtx(engine, getPayload(), { windowProgress: 0.5, isLastTick: false }));

        expect(projectiles[0]!.isHeld).toBe(true);
    });

    it('is released along its direction at the window end', () => {
        const { engine, projectiles } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        const behaviour = new ProjectileLaunchBehaviour()
            .withOrigin(() => origin)
            .withDirection(() => along)
            .withSpeed(400)
            .withMaxRange(120)
            .withHold();
        behaviour.onSetup(ctx);

        behaviour.onTick!(makeTickCtx(engine, getPayload(), { windowProgress: 1, isLastTick: true }));

        const projectile = projectiles[0]!;
        expect(projectile.isHeld).toBe(false);
        expect(projectile.velocityX).toBe(400);
        expect(projectile.velocityY).toBe(0);
    });

    it('is cancelled and calls onCancelled when interrupted while held', () => {
        const { engine, projectiles } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        const onCancelled = vi.fn();
        const behaviour = new ProjectileLaunchBehaviour()
            .withOrigin(() => origin)
            .withDirection(() => along)
            .withHold({ onCancelled });
        behaviour.onSetup(ctx);

        behaviour.onInterrupt!(makeInterruptCtx(engine, getPayload()));

        const projectile = projectiles[0]!;
        expect(projectile.active).toBe(false);
        expect(projectile.isHeld).toBe(false);
        expect(onCancelled).toHaveBeenCalledTimes(1);
        expect(onCancelled).toHaveBeenCalledWith(expect.anything(), projectile);
    });

    it('is not cancelled by an interrupt after release', () => {
        const { engine, projectiles } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        const onCancelled = vi.fn();
        const behaviour = new ProjectileLaunchBehaviour()
            .withOrigin(() => origin)
            .withDirection(() => along)
            .withHold({ onCancelled });
        behaviour.onSetup(ctx);
        behaviour.onTick!(makeTickCtx(engine, getPayload(), { windowProgress: 1, isLastTick: true }));

        behaviour.onInterrupt!(makeInterruptCtx(engine, getPayload()));

        expect(projectiles[0]!.active).toBe(true);
        expect(onCancelled).not.toHaveBeenCalled();
    });

    it('without withHold, launches immediately toward the target as before', () => {
        const { engine, projectiles } = makeEngine();
        const { ctx, getPayload } = makeSetupCtx(engine);
        const behaviour = new ProjectileLaunchBehaviour().withSpeed(400).withMaxRange(200);

        behaviour.onSetup(ctx);

        const projectile = projectiles[0]!;
        expect(projectile.isHeld).toBe(false);
        expect(projectile.velocityX).toBe(400);
        expect(projectile.velocityY).toBe(0);
        expect(getPayload()).toBeUndefined();
    });
});
