import { describe, expect, it } from 'vitest';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { ActiveAbility } from '../../game/types';
import {
    ThornbinderBrambleAbility,
    THORNBINDER_ABILITY_ID,
    THORNBINDER_BASE_RADIUS,
    THORNBINDER_FLIGHT_DURATION,
    THORNBINDER_LOCK_TIME,
    THORNBINDER_PROJECTILE_SLOWDOWN,
    THORNBINDER_TARGETING_RANGE,
    THORN_PROJECTILE_SPEED,
} from './0008Ability';
import { ThornStompAbility } from '../0016_ThornStomp/0016Ability';

function makeGraphicsRecorder(): IAbilityPreviewGraphics & {
    circles: { x: number; y: number; radius: number }[];
    lineToCalls: number;
} {
    const circles: { x: number; y: number; radius: number }[] = [];
    let lineToCalls = 0;
    return {
        circles,
        get lineToCalls() { return lineToCalls; },
        clear: () => {},
        moveTo: () => {},
        lineTo: () => { lineToCalls += 1; },
        circle: (x, y, radius) => { circles.push({ x, y, radius }); },
        fill: () => {},
        stroke: () => {},
    };
}

function makeCaster(): Unit {
    return new Unit({
        x: 200,
        y: 200,
        hp: 52,
        speed: 42,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'thornbinder',
        name: 'thornbinder',
    });
}

function makeEngine(caster: Unit) {
    const engine = {
        units: [caster],
        gameTime: 0,
        eventBus: new EventBus(),
        terrainLayers: new TerrainLayerManager(),
        lightLevelEnabled: false,
        globalLightLevel: 0,
        terrainManager: null,
        addEffect: () => {},
        getAllLightSources: () => [],
        generateRandomInteger: () => 0,
        getUnit: (id: string) => engine.units.find((u) => u.id === id),
    };
    return engine;
}

function fireBramble(engine: ReturnType<typeof makeEngine>, caster: Unit, x: number, y: number) {
    const projectile = new Projectile({
        x,
        y,
        velocityX: 0,
        velocityY: 0,
        damage: 0,
        sourceTeamId: caster.teamId,
        sourceUnitId: caster.id,
        sourceAbilityId: THORNBINDER_ABILITY_ID,
        maxDistance: 0,
    });
    ThornbinderBrambleAbility.onProjectileExpired!(engine, caster, projectile);
}

describe('ThornbinderBrambleAbility ground-thorn ownership', () => {
    it('does not remove its own previously-placed patch when it casts again', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);

        fireBramble(engine, caster, 100, 100);
        const firstCastEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(firstCastEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireBramble(engine, caster, 400, 400);

        for (const effect of firstCastEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });

    it('does not remove a patch placed by Thorn Stomp on the same unit', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);

        const stompStrike = ThornStompAbility.abilityTimings.find((t) => t.id === 'strike');
        expect(stompStrike).toBeDefined();
        ThornStompAbility.doCardEffect!(engine, caster, [], 0, stompStrike!.start + 0.01);
        const stompEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(stompEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireBramble(engine, caster, 400, 400);

        for (const effect of stompEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });
});

describe('ThornbinderBrambleAbility impact', () => {
    it('damages and knocks back enemies caught in the blast, radially outward from the impact point', () => {
        const caster = makeCaster();
        const target = new Unit({
            x: caster.x + 40,
            y: caster.y,
            hp: 52,
            speed: 42,
            teamId: 'player',
            ownerId: 'player-1',
            characterId: 'dummy',
            name: 'dummy',
        });
        const engine = makeEngine(caster);
        engine.units.push(target);

        const hpBefore = target.hp;
        fireBramble(engine, caster, caster.x, caster.y);

        expect(target.hp).toBeLessThan(hpBefore);
        expect(target.knockback).not.toBeNull();
    });
});

describe('ThornbinderBrambleAbility projectile speed', () => {
    it('covers max range in the slowed flight window and keeps strike/prefire aligned with that window', () => {
        expect(THORN_PROJECTILE_SPEED * THORNBINDER_FLIGHT_DURATION).toBeCloseTo(
            THORNBINDER_TARGETING_RANGE,
        );
        expect(THORNBINDER_PROJECTILE_SLOWDOWN).toBe(4);
        expect(ThornbinderBrambleAbility.prefireTime).toBe(
            THORNBINDER_LOCK_TIME + THORNBINDER_FLIGHT_DURATION,
        );
        const strike = ThornbinderBrambleAbility.abilityTimings.find((t) => t.id === 'strike');
        expect(strike).toBeDefined();
        expect(strike!.end - strike!.start).toBe(THORNBINDER_FLIGHT_DURATION);
    });
});

describe('ThornbinderBrambleAbility renderActivePreview (pre-launch windup line, caster-driven)', () => {
    it('draws the arc trajectory line and an impact ring at the target during windup, and nothing once the projectile would have launched', () => {
        const caster = makeCaster();
        const targetX = caster.x + 100;
        const targetY = caster.y;
        const activeAbility: ActiveAbility = {
            abilityId: THORNBINDER_ABILITY_ID,
            startTime: 0,
            targets: [{ type: 'pixel', position: { x: targetX, y: targetY } }],
        };

        const duringWindup = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderActivePreview!(duringWindup, caster, activeAbility, THORNBINDER_LOCK_TIME / 2);
        expect(duringWindup.lineToCalls).toBeGreaterThan(0);
        expect(duringWindup.circles.length).toBe(1); // impact ring at the landing spot, shown before launch too
        expect(duringWindup.circles[0].x).toBeCloseTo(targetX, 5);
        expect(duringWindup.circles[0].y).toBeCloseTo(targetY, 5);
        expect(duringWindup.circles[0].radius).toBe(THORNBINDER_BASE_RADIUS);

        const afterLaunch = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderActivePreview!(afterLaunch, caster, activeAbility, THORNBINDER_LOCK_TIME + 0.01);
        expect(afterLaunch.lineToCalls).toBe(0);
        expect(afterLaunch.circles.length).toBe(0);
    });
});

describe('ThornbinderBrambleAbility renderProjectilePreview (in-flight impact ring, projectile-driven)', () => {
    function makeInFlightProjectile(distanceTraveled: number): Projectile {
        // Launched from (100, 300) toward max range along +x, using the live bramble speed.
        const proj = new Projectile({
            x: 100 + distanceTraveled,
            y: 300,
            velocityX: THORN_PROJECTILE_SPEED,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'enemy',
            sourceUnitId: 'caster-1',
            sourceAbilityId: THORNBINDER_ABILITY_ID,
            maxDistance: THORNBINDER_TARGETING_RANGE,
        });
        proj.distanceTraveled = distanceTraveled;
        return proj;
    }

    it('grows the ring with travel progress and centers it on the reconstructed landing spot, not the projectile\'s current position', () => {
        const proj = makeInFlightProjectile(THORNBINDER_TARGETING_RANGE / 2);

        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderProjectilePreview!(gr, proj, 0);

        const landingX = 100 + THORNBINDER_TARGETING_RANGE;
        expect(gr.circles.length).toBeGreaterThan(0);
        for (const c of gr.circles) {
            expect(c.x).toBeCloseTo(landingX, 5);
            expect(c.y).toBeCloseTo(300, 5);
        }
        const innerRing = gr.circles[gr.circles.length - 1]!;
        expect(innerRing.radius).toBeCloseTo(THORNBINDER_BASE_RADIUS * 0.5, 1);
    });

    it('fills the explosion ring at one-quarter radius after one-quarter of max-range travel (time-independent of the 4x slowdown)', () => {
        const proj = makeInFlightProjectile(THORNBINDER_TARGETING_RANGE / THORNBINDER_PROJECTILE_SLOWDOWN);

        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderProjectilePreview!(gr, proj, 0);

        const innerRing = gr.circles[gr.circles.length - 1]!;
        expect(innerRing.radius).toBeCloseTo(
            THORNBINDER_BASE_RADIUS / THORNBINDER_PROJECTILE_SLOWDOWN,
            1,
        );
    });

    it('keeps rendering when the launching unit has been interrupted or killed', () => {
        // renderProjectilePreview never reads the caster or its ActiveAbility state — only the
        // Projectile's own fields — so it renders identically whether the caster that launched
        // it (sourceUnitId 'dead-caster') is alive, interrupted, or dead. There's no live Unit
        // for 'dead-caster' in this test at all, which is the point.
        const proj = makeInFlightProjectile(250);

        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderProjectilePreview!(gr, proj, 999);
        expect(gr.circles.length).toBeGreaterThan(0);
    });
});
