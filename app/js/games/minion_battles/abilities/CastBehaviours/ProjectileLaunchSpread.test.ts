/**
 * ProjectileLaunch `withRandomAimSpread`: each launch rotates its aim by a seeded random angle within
 * the half-angle, read from the engine's `generateRandomInteger`.
 */
import { describe, it, expect } from 'vitest';
// Load the registry first (see behaviours.test.ts: avoids the CastBehaviours import cycle).
import '../AbilityRegistry';
import { ProjectileLaunchBehaviour } from './ProjectileLaunchBehaviour';
import type { CastBehaviourSetupContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import type { Projectile } from '../../game/projectiles/Projectile';

const caster = { id: 'caster_1', teamId: 'player', x: 0, y: 0, radius: 10 } as unknown as Unit;
const target = { type: 'pixel', position: { x: 200, y: 0 } } as ResolvedTarget;

function launchWithRoll(roll: number, halfAngleDeg: number): Projectile {
    const projectiles: Projectile[] = [];
    const engine = {
        projectiles,
        addProjectile: (p: Projectile) => { p.id = 'proj_1'; projectiles.push(p); },
        getUnit: () => undefined,
        units: [],
        generateRandomInteger: () => roll,
    } as unknown as AbilityEngineContext;
    const ctx: CastBehaviourSetupContext = {
        caster, abilityId: 'test_ability', target, allTargets: [target], castPayload: {},
        behaviourPayload: undefined, setBehaviourPayload: () => {}, engine,
    };
    new ProjectileLaunchBehaviour().withSpeed(100).withMaxRange(500).withRandomAimSpread(halfAngleDeg).onSetup(ctx);
    expect(projectiles).toHaveLength(1);
    return projectiles[0]!;
}

const angleDeg = (p: Projectile) => (Math.atan2(p.velocityY, p.velocityX) * 180) / Math.PI;

describe('ProjectileLaunch withRandomAimSpread', () => {
    it('maps the roll across [-half, +half] degrees round the aim', () => {
        expect(angleDeg(launchWithRoll(0, 20))).toBeCloseTo(-20);
        expect(angleDeg(launchWithRoll(5000, 20))).toBeCloseTo(0);
        expect(angleDeg(launchWithRoll(10000, 20))).toBeCloseTo(20);
    });

    it('keeps the launch speed', () => {
        const p = launchWithRoll(2500, 30);
        expect(Math.hypot(p.velocityX, p.velocityY)).toBeCloseTo(100);
    });
});
