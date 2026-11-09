/**
 * Husk Disease Cloud: three lobs in a line beside the target. Each landing leaves a 3x3 patch of
 * miasma and damages enemies in it; the line takes the side holding less miasma.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { CastBehaviourSetupContext } from '../../../abilities/castBehaviourTypes';
import { Projectile } from '../../../game/projectiles/Projectile';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { MIASMA_EFFECT_TYPE } from '../../../game/terrainEffects/terrainEffectDefs';
import { ENEMY_HUSK } from '../../../constants/enemyConstants';
import { resolveAngledLine } from '../../../abilities/projectileLine';
import { getEffectiveCastBehaviours } from '../../../abilities/abilityTimings';
import '../../../abilities/AbilityRegistry';
import {
    DISEASE_CLOUD_ABILITY_ID,
    DISEASE_CLOUD_ANGLE_RAD,
    DISEASE_CLOUD_DAMAGE,
    DISEASE_CLOUD_DURATION_SEC,
    DISEASE_CLOUD_PROJECTILE_COUNT,
    DISEASE_CLOUD_SPACING,
    DiseaseCloudAbility,
} from './1103Ability';

function makeUnit(id: string, teamId: 'enemy' | 'player', x: number, y: number): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 50,
        maxHp: 50,
        speed: 40,
        teamId,
        ownerId: teamId === 'enemy' ? 'ai' : 'p1',
        characterId: teamId === 'enemy' ? 'husk' : 'warrior',
        name: id,
        abilities: teamId === 'enemy' ? [...ENEMY_HUSK.abilities] : [],
        radius: 16,
    });
}

function makeEngine(units: Unit[], rng = 0) {
    const projectiles: Projectile[] = [];
    const engine = {
        gameTime: 3,
        units,
        projectiles,
        terrainLayers: new TerrainLayerManager(),
        terrainManager: null,
        eventBus: new EventBus(),
        addEffect: () => {},
        addProjectile: (p: Projectile) => projectiles.push(p),
        getUnit: (id: string) => units.find((u) => u.id === id),
        generateRandomInteger: (min: number) => min + rng,
    };
    return { engine, projectiles };
}

function launch(husk: Unit, aim: { x: number; y: number }, engine: unknown): void {
    const interval = DiseaseCloudAbility.abilityTimings!.find((t) => 'id' in t && t.id === 'launch')!;
    const entry = getEffectiveCastBehaviours(interval as never)![0];
    const target = { type: 'pixel' as const, position: aim };
    entry.behaviour.onSetup!({
        caster: husk,
        abilityId: DISEASE_CLOUD_ABILITY_ID,
        target,
        allTargets: [target],
        castPayload: undefined,
        behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine: engine as AbilityEngineContext,
    } as CastBehaviourSetupContext);
}

/** Where a straight-flying projectile comes to rest. */
function landingOf(p: Projectile): { x: number; y: number } {
    const speed = Math.hypot(p.velocityX, p.velocityY);
    return {
        x: p.x + (p.velocityX / speed) * p.maxDistance,
        y: p.y + (p.velocityY / speed) * p.maxDistance,
    };
}

function gasAround(engine: { terrainLayers: TerrainLayerManager }, point: { x: number; y: number }): void {
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const col = Math.floor(point.x / CELL_SIZE) + dc;
            const row = Math.floor(point.y / CELL_SIZE) + dr;
            engine.terrainLayers.add({
                id: `pre-${col}-${row}`,
                layer: 'air',
                effectType: MIASMA_EFFECT_TYPE,
                placedAtGameTime: 0,
                expiresAtGameTime: 100,
                area: { type: 'cell', col, row },
                params: {},
            });
        }
    }
}

describe('resolveAngledLine', () => {
    it('centres the line on the aim distance, turned off the aim direction', () => {
        const pts = resolveAngledLine({ x: 0, y: 0 }, { x: 200, y: 0 }, {
            angleRad: Math.PI / 2,
            side: 1,
            count: 3,
            spacing: 100,
        });
        expect(pts).toHaveLength(3);
        // A quarter turn: points run straight down the +y axis at 100, 200, 300.
        pts.forEach((p, i) => {
            expect(p.x).toBeCloseTo(0);
            expect(p.y).toBeCloseTo(100 + i * 100);
        });
    });

    it('mirrors for the other side and drops landings inside minDistance', () => {
        const pts = resolveAngledLine({ x: 0, y: 0 }, { x: 0, y: 100 }, {
            angleRad: Math.PI / 2,
            side: -1,
            count: 3,
            spacing: 100,
            minDistance: 50,
        });
        expect(pts.map((p) => Math.round(p.x))).toEqual([100, 200]);
    });
});

describe('Husk Disease Cloud (1103)', () => {
    it('is on the Husk spawn template', () => {
        expect(ENEMY_HUSK.abilities).toContain(DISEASE_CLOUD_ABILITY_ID);
    });

    it('lobs three projectiles that land in a line beside the target, not on it', () => {
        const husk = makeUnit('husk1', 'enemy', CELL_SIZE * 5.5, CELL_SIZE * 5.5);
        const { engine, projectiles } = makeEngine([husk]);
        const aim = { x: husk.x + CELL_SIZE * 5, y: husk.y };
        launch(husk, aim, engine);

        expect(projectiles).toHaveLength(DISEASE_CLOUD_PROJECTILE_COUNT);
        const landings = projectiles.map(landingOf);
        const aimDist = Math.hypot(aim.x - husk.x, aim.y - husk.y);
        // The middle landing sits at the aim's distance, turned by the configured angle (tie -> -y).
        const mid = landings[1];
        expect(Math.hypot(mid.x - husk.x, mid.y - husk.y)).toBeCloseTo(aimDist);
        expect(Math.atan2(mid.y - husk.y, mid.x - husk.x)).toBeCloseTo(-DISEASE_CLOUD_ANGLE_RAD);
        // Neighbours are one patch apart along the line.
        expect(Math.hypot(landings[1].x - landings[0].x, landings[1].y - landings[0].y)).toBeCloseTo(
            DISEASE_CLOUD_SPACING,
        );
        // The target itself is not in the middle patch.
        expect(Math.hypot(mid.x - aim.x, mid.y - aim.y)).toBeGreaterThan(CELL_SIZE * 2);
    });

    it('prefers the side with less miasma', () => {
        const husk = makeUnit('husk1', 'enemy', CELL_SIZE * 5.5, CELL_SIZE * 5.5);
        const aim = { x: husk.x + CELL_SIZE * 5, y: husk.y };

        const first = makeEngine([husk]); // tie, rng 0 -> counter-clockwise (-y)
        launch(husk, aim, first.engine);
        expect(first.projectiles.every((p) => p.velocityY < 0)).toBe(true);

        // Gas the whole -y side: the next cast goes to +y even though the tie-break says -y.
        const second = makeEngine([husk]);
        first.projectiles.forEach((p) => gasAround(second.engine, landingOf(p)));
        launch(husk, aim, second.engine);
        expect(second.projectiles.every((p) => p.velocityY > 0)).toBe(true);
    });

    it('on landing leaves a 3x3 miasma patch and damages enemies inside it', () => {
        const husk = makeUnit('husk1', 'enemy', CELL_SIZE * 2.5, CELL_SIZE * 2.5);
        const victim = makeUnit('p1', 'player', CELL_SIZE * 10.5, CELL_SIZE * 10.5);
        const bystander = makeUnit('p2', 'player', CELL_SIZE * 13.5, CELL_SIZE * 10.5);
        const ally = makeUnit('husk2', 'enemy', CELL_SIZE * 11.5, CELL_SIZE * 9.5);
        const { engine } = makeEngine([husk, victim, bystander, ally]);

        const projectile = new Projectile({
            x: CELL_SIZE * 10.5,
            y: CELL_SIZE * 10.5,
            velocityX: 0,
            velocityY: 0,
            damage: 0,
            sourceTeamId: 'enemy',
            sourceUnitId: husk.id,
            sourceAbilityId: DISEASE_CLOUD_ABILITY_ID,
            maxDistance: 0,
        });
        DiseaseCloudAbility.onProjectileExpired!(engine as unknown as EngineContext, husk, projectile);

        expect(victim.hp).toBe(50 - DISEASE_CLOUD_DAMAGE);
        expect(bystander.hp).toBe(50);
        expect(ally.hp).toBe(50);

        expect(engine.terrainLayers.allEffects.size).toBe(9);
        for (let row = 9; row <= 11; row++) {
            for (let col = 9; col <= 11; col++) {
                const rec = engine.terrainLayers.getAirEffectAt(col, row);
                expect(rec?.effectType).toBe(MIASMA_EFFECT_TYPE);
                expect(rec?.ownerUnitId).toBe('husk1');
                expect(rec?.expiresAtGameTime).toBe(3 + DISEASE_CLOUD_DURATION_SEC);
            }
        }
    });
});
