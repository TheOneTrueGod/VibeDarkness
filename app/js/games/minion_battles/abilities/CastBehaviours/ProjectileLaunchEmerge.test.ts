/**
 * ProjectileLaunch `withEmergeFrom`: one projectile out of each host unit, flying host -> target.
 * Driven with hand-built contexts, like `behaviours.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
// Load the registry first (see behaviours.test.ts: avoids the CastBehaviours import cycle).
import '../AbilityRegistry';
import { ProjectileLaunchBehaviour } from './ProjectileLaunchBehaviour';
import type { CastBehaviourSetupContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import type { Projectile } from '../../game/projectiles/Projectile';

const caster = { id: 'caster_1', teamId: 'player', x: 0, y: 0, radius: 10 } as unknown as Unit;
const hostA = { id: 'host_a', teamId: 'enemy', x: 50, y: 40, radius: 10 } as unknown as Unit;
const hostB = { id: 'host_b', teamId: 'enemy', x: 80, y: -60, radius: 10 } as unknown as Unit;
const target = { type: 'pixel', position: { x: 200, y: 0 } } as ResolvedTarget;

function setup(): { ctx: CastBehaviourSetupContext; projectiles: Projectile[] } {
    const projectiles: Projectile[] = [];
    let nextId = 1;
    const engine = {
        projectiles,
        addProjectile: (p: Projectile) => {
            p.id = `proj_${nextId++}`;
            projectiles.push(p);
        },
        getUnit: () => undefined,
        units: [],
    } as unknown as AbilityEngineContext;
    const ctx: CastBehaviourSetupContext = {
        caster,
        abilityId: 'test_ability',
        target,
        allTargets: [target],
        castPayload: {},
        behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine,
    };
    return { ctx, projectiles };
}

describe('ProjectileLaunch withEmergeFrom', () => {
    it('launches one projectile per host, from the host toward the target, host pre-marked as hit', () => {
        const { ctx, projectiles } = setup();
        const onEmerge = vi.fn();
        new ProjectileLaunchBehaviour()
            .withSpeed(100)
            .withMaxRange(500)
            .withBaseDamage(4)
            .withEmergeFrom(() => [hostA, hostB], onEmerge)
            .onSetup(ctx);

        expect(projectiles).toHaveLength(2);
        expect(onEmerge).toHaveBeenCalledTimes(2);
        expect(onEmerge.mock.calls.map((c) => c[1])).toEqual([hostA, hostB]);

        const [pa, pb] = projectiles;
        expect([pa.x, pa.y]).toEqual([hostA.x, hostA.y]);
        expect([pb.x, pb.y]).toEqual([hostB.x, hostB.y]);
        // Velocity points from each host at (200, 0).
        const lenA = Math.hypot(200 - hostA.x, 0 - hostA.y);
        expect(pa.velocityX).toBeCloseTo(((200 - hostA.x) / lenA) * 100);
        expect(pa.velocityY).toBeCloseTo(((0 - hostA.y) / lenA) * 100);
        expect(pb.velocityY).toBeGreaterThan(0);
        expect(pa.maxDistance).toBeCloseTo(lenA);
        expect(pa.hitUnitIds.has(hostA.id)).toBe(true);
        expect(pb.hitUnitIds.has(hostB.id)).toBe(true);
        expect(pa.hitUnitIds.has(hostB.id)).toBe(false);
        // The pre-marked host does not eat the flight's own hit.
        expect(pa.hitPolicy.damagingHits - pa.hitUnitIds.size).toBe(1);
    });

    it('launches nothing when there are no hosts', () => {
        const { ctx, projectiles } = setup();
        const onEmerge = vi.fn();
        new ProjectileLaunchBehaviour().withEmergeFrom(() => [], onEmerge).onSetup(ctx);
        expect(projectiles).toHaveLength(0);
        expect(onEmerge).not.toHaveBeenCalled();
    });

    it('clamps flight distance to maxRange from the host', () => {
        const { ctx, projectiles } = setup();
        new ProjectileLaunchBehaviour().withMaxRange(60).withEmergeFrom(() => [hostA]).onSetup(ctx);
        expect(projectiles[0].maxDistance).toBeCloseTo(60);
    });

    it('runs onEmerge but launches nothing when the host sits on the target', () => {
        const { ctx, projectiles } = setup();
        const onEmerge = vi.fn();
        const onTarget = { id: 'host_c', teamId: 'enemy', x: 200, y: 0, radius: 10 } as unknown as Unit;
        new ProjectileLaunchBehaviour().withEmergeFrom(() => [onTarget], onEmerge).onSetup(ctx);
        expect(onEmerge).toHaveBeenCalledTimes(1);
        expect(projectiles).toHaveLength(0);
    });
});
