import { describe, expect, it } from 'vitest';
import {
    Gravity,
    computeGravityGrazeRatePerRound,
} from './Gravity';
import { EventBus } from '../game/EventBus';
import { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import type { Projectile } from '../game/projectiles/Projectile';
import { ROUND_DURATION } from '../game/gameConstants';
import {
    GRAVITY_GRAZE_MAX_DISTANCE,
    GRAVITY_GRAZE_MIN_DISTANCE,
    GRAVITY_MAX_PER_ROUND_UNITS,
    GRAVITY_MIN_PER_ROUND,
} from '../card_defs/09_gravity_core/gravityConstants';

const UNIT_RADIUS = 20;

function makeUnit(id: string, teamId: 'player' | 'enemy', x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'slime',
        name: id,
        radius: UNIT_RADIUS,
    });
}

function makeProjectile(x: number, y: number, radius = 5): Projectile {
    return {
        x,
        y,
        radius,
        active: true,
        sourceTeamId: 'enemy',
    } as Projectile;
}

function makeEngineContext(units: Unit[], projectiles: Projectile[] = []): EngineContext {
    return {
        units,
        projectiles,
    } as unknown as EngineContext;
}

/** One full round of tick time — gain equals ratePerRound exactly. */
const ONE_ROUND_DT = ROUND_DURATION;

describe('Gravity resource', () => {
    it('starts at 0 with max 100', () => {
        const gravity = new Gravity();
        expect(gravity.current).toBe(0);
        expect(gravity.max).toBe(100);
    });

    it('grants floor rate when far from everything', () => {
        const owner = makeUnit('player', 'player', 0, 0);
        const gravity = new Gravity();
        owner.attachResource(gravity, new EventBus());

        const farEnemy = makeUnit(
            'enemy',
            'enemy',
            GRAVITY_GRAZE_MAX_DISTANCE + UNIT_RADIUS * 2 + 50,
            0,
        );
        const engine = makeEngineContext([owner, farEnemy]);

        gravity.onTick(owner, engine, ONE_ROUND_DT);
        expect(gravity.current).toBe(GRAVITY_MIN_PER_ROUND);
    });

    it('grants max unit rate at or under min graze distance', () => {
        const owner = makeUnit('player', 'player', 0, 0);
        const gravity = new Gravity();
        owner.attachResource(gravity, new EventBus());

        const centerDist = GRAVITY_GRAZE_MIN_DISTANCE + owner.radius + UNIT_RADIUS;
        const closeEnemy = makeUnit('enemy', 'enemy', centerDist, 0);
        const engine = makeEngineContext([owner, closeEnemy]);

        gravity.onTick(owner, engine, ONE_ROUND_DT);
        expect(gravity.current).toBe(GRAVITY_MAX_PER_ROUND_UNITS);
    });

    it('projectile graze rate exceeds unit graze rate at equal edge-to-edge distance', () => {
        const owner = makeUnit('player', 'player', 0, 0);
        const grazeDist = (GRAVITY_GRAZE_MIN_DISTANCE + GRAVITY_GRAZE_MAX_DISTANCE) / 2;
        const centerDistToUnit = grazeDist + owner.radius + UNIT_RADIUS;
        const centerDistToProjectile = grazeDist + owner.radius + 5;

        const enemyOnly = makeEngineContext([owner, makeUnit('enemy', 'enemy', centerDistToUnit, 0)]);
        const projectileOnly = makeEngineContext(
            [owner],
            [makeProjectile(centerDistToProjectile, 0)],
        );

        const unitRate = computeGravityGrazeRatePerRound(owner, enemyOnly);
        const projectileRate = computeGravityGrazeRatePerRound(owner, projectileOnly);

        expect(projectileRate).toBeGreaterThan(unitRate);
    });

    it('clamps gravity at max (100)', () => {
        const owner = makeUnit('player', 'player', 0, 0);
        const gravity = new Gravity();
        gravity.current = 99;
        owner.attachResource(gravity, new EventBus());

        const closeEnemy = makeUnit(
            'enemy',
            'enemy',
            GRAVITY_GRAZE_MIN_DISTANCE + owner.radius + UNIT_RADIUS,
            0,
        );
        const engine = makeEngineContext([owner, closeEnemy]);

        gravity.onTick(owner, engine, ONE_ROUND_DT);
        expect(gravity.current).toBe(100);
    });
});
