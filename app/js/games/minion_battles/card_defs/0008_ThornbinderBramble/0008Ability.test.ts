import { describe, expect, it } from 'vitest';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { ActiveAbility } from '../../game/types';
import { ThornbinderBrambleAbility, THORNBINDER_ABILITY_ID } from './0008Ability';
import { ThornStompAbility } from '../0016_ThornStomp/0016Ability';

// Mirrors the ability's own private constants so the test doesn't need to export them just for
// testing.
const LOCK_TIME = 0.85;
const BASE_RADIUS = 95;

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
    return {
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
    };
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

        ThornStompAbility.doCardEffect!(engine, caster, [], 0, 1);
        const stompEffects = Array.from(engine.terrainLayers.allEffects.values());
        expect(stompEffects.length).toBeGreaterThan(0);

        engine.gameTime = 5;
        fireBramble(engine, caster, 400, 400);

        for (const effect of stompEffects) {
            expect(engine.terrainLayers.allEffects.has(effect.id)).toBe(true);
        }
    });
});

describe('ThornbinderBrambleAbility renderActivePreview (pre-launch windup line, caster-driven)', () => {
    it('draws only the arc trajectory line during windup, and nothing once the projectile would have launched', () => {
        const caster = makeCaster();
        const activeAbility: ActiveAbility = {
            abilityId: THORNBINDER_ABILITY_ID,
            startTime: 0,
            targets: [{ type: 'pixel', position: { x: caster.x + 100, y: caster.y } }],
        };

        const duringWindup = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderActivePreview!(duringWindup, caster, activeAbility, LOCK_TIME / 2);
        expect(duringWindup.lineToCalls).toBeGreaterThan(0);
        expect(duringWindup.circles.length).toBe(0); // no impact ring — that's the projectile's job now

        const afterLaunch = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderActivePreview!(afterLaunch, caster, activeAbility, LOCK_TIME + 0.01);
        expect(afterLaunch.lineToCalls).toBe(0);
        expect(afterLaunch.circles.length).toBe(0);
    });
});

describe('ThornbinderBrambleAbility renderProjectilePreview (in-flight impact ring, projectile-driven)', () => {
    function makeInFlightProjectile(distanceTraveled: number): Projectile {
        // Launched from (100, 300) toward (400, 300) — pure +x direction, 300px total flight.
        const proj = new Projectile({
            x: 100 + distanceTraveled,
            y: 300,
            velocityX: 300,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'enemy',
            sourceUnitId: 'caster-1',
            sourceAbilityId: THORNBINDER_ABILITY_ID,
            maxDistance: 300,
        });
        proj.distanceTraveled = distanceTraveled;
        return proj;
    }

    it('grows the ring with travel progress and centers it on the reconstructed landing spot, not the projectile\'s current position', () => {
        const proj = makeInFlightProjectile(150); // halfway through a 300px flight

        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderProjectilePreview!(gr, proj, 0);

        expect(gr.circles.length).toBeGreaterThan(0);
        for (const c of gr.circles) {
            expect(c.x).toBeCloseTo(400, 5); // landing spot (100 + 300), not proj.x (250)
            expect(c.y).toBeCloseTo(300, 5);
        }
        const innerRing = gr.circles[gr.circles.length - 1]!;
        expect(innerRing.radius).toBeCloseTo(BASE_RADIUS * 0.5, 1);
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
