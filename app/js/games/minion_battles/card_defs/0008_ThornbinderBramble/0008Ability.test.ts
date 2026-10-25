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
    resolveThornbinderImpactCells,
} from './0008Ability';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { worldToTile } from '../../abilities/tileAreaHelpers';
import { isAbilityTimingInterval, getEffectiveCastBehaviours, type AbilityTimingInterval } from '../../abilities/abilityTimings';
import type { AbilityEngineContext } from '../../abilities/AbilityEngineContext';
import type { CastBehaviourTickContext } from '../../abilities/castBehaviourTypes';
import { ThornStompAbility } from '../0016_ThornStomp/0016Ability';

function makeGraphicsRecorder(): IAbilityPreviewGraphics & {
    circles: { x: number; y: number; radius: number }[];
    lineToCalls: number;
    /** Tiles filled by drawTileAreaTelegraph, as "col,row" (each fill follows a moveTo at the tile corner). */
    filledTiles: Set<string>;
} {
    const circles: { x: number; y: number; radius: number }[] = [];
    const filledTiles = new Set<string>();
    let lineToCalls = 0;
    let lastMove = { x: 0, y: 0 };
    return {
        circles,
        filledTiles,
        get lineToCalls() { return lineToCalls; },
        clear: () => {},
        moveTo: (x, y) => { lastMove = { x, y }; },
        lineTo: () => { lineToCalls += 1; },
        circle: (x, y, radius) => { circles.push({ x, y, radius }); },
        fill: () => { filledTiles.add(`${Math.round(lastMove.x / CELL_SIZE)},${Math.round(lastMove.y / CELL_SIZE)}`); },
        stroke: () => {},
    };
}

function keysOf(cells: { col: number; row: number }[]): Set<string> {
    return new Set(cells.map((c) => `${c.col},${c.row}`));
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

/** Runs Thorn Stomp's strike-window behaviours in order, as the tick loop does on window entry. */
function fireStomp(engine: ReturnType<typeof makeEngine>, caster: Unit) {
    const strike = (ThornStompAbility.abilityTimings as AbilityTimingInterval[]).find((t) => t.id === 'strike')!;
    for (const entry of getEffectiveCastBehaviours(strike)!) {
        const ctx: CastBehaviourTickContext = {
            caster,
            abilityId: ThornStompAbility.id,
            target: { type: 'pixel', position: { x: caster.x, y: caster.y } },
            allTargets: [],
            castPayload: undefined,
            behaviourPayload: undefined,
            setBehaviourPayload: () => {},
            engine: engine as unknown as AbilityEngineContext,
            windowProgress: 0,
            prevWindowProgress: 0,
            isFirstTick: true,
            isLastTick: true,
        };
        entry.behaviour.onTick?.(ctx);
    }
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

        fireStomp(engine, caster);
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
        const strike = ThornbinderBrambleAbility.abilityTimings.find(
            (t): t is AbilityTimingInterval => isAbilityTimingInterval(t) && t.id === 'strike',
        );
        expect(strike).toBeDefined();
        expect(strike!.end - strike!.start).toBe(THORNBINDER_FLIGHT_DURATION);
    });
});

describe('ThornbinderBrambleAbility tile-based impact', () => {
    it('covers a fixed 21-tile disc around the landing tile (5x5 minus corners)', () => {
        const cells = resolveThornbinderImpactCells({ x: 205, y: 215 });
        expect(cells).toHaveLength(21);
        expect(cells[0]).toEqual({ col: 5, row: 5 });
        const keys = keysOf(cells);
        expect(keys.has('7,5')).toBe(true);
        expect(keys.has('6,7')).toBe(true);
        expect(keys.has('7,7')).toBe(false); // corner excluded
        expect(keys.has('8,5')).toBe(false);
        // Anywhere in the same tile gives the same footprint.
        expect(keysOf(resolveThornbinderImpactCells({ x: 201, y: 239 }))).toEqual(keys);
    });

    it('places thorns on exactly the previewed tiles and hits units by tile', () => {
        const caster = makeCaster();
        const engine = makeEngine(caster);
        // Landing off-centre inside tile (5,5): the impact snaps to that tile.
        const landing = { x: 5 * CELL_SIZE + 3, y: 5 * CELL_SIZE + 37 };
        const mk = (id: string, col: number, row: number) => new Unit({
            id,
            x: col * CELL_SIZE + CELL_SIZE / 2,
            y: row * CELL_SIZE + CELL_SIZE / 2,
            hp: 52,
            speed: 42,
            teamId: 'player',
            ownerId: 'player-1',
            characterId: 'dummy',
            name: id,
        });
        const inEdgeTile = mk('in', 7, 6);
        const cornerOutside = mk('out', 7, 7);
        engine.units.push(inEdgeTile, cornerOutside);

        fireBramble(engine, caster, landing.x, landing.y);

        const expected = keysOf(resolveThornbinderImpactCells(landing));
        const thornCells = new Set<string>();
        for (let col = 0; col < 12; col++) {
            for (let row = 0; row < 12; row++) {
                if (engine.terrainLayers.getGroundEffectAt(col, row)) thornCells.add(`${col},${row}`);
            }
        }
        expect(thornCells).toEqual(expected);
        expect(inEdgeTile.hp).toBeLessThan(52);
        expect(cornerOutside.hp).toBe(52);
    });
});

describe('ThornbinderBrambleAbility renderActivePreview (pre-launch windup, caster-driven)', () => {
    it('draws the arc trajectory and the exact impact tiles during windup, and nothing once launched', () => {
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
        expect(duringWindup.circles.length).toBe(0);
        expect(duringWindup.filledTiles).toEqual(keysOf(resolveThornbinderImpactCells({ x: targetX, y: targetY })));

        const afterLaunch = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderActivePreview!(afterLaunch, caster, activeAbility, THORNBINDER_LOCK_TIME + 0.01);
        expect(afterLaunch.lineToCalls).toBe(0);
        expect(afterLaunch.filledTiles.size).toBe(0);
    });

    it('clamps an out-of-range aim to the projectile range before picking tiles', () => {
        const caster = makeCaster();
        const far = { x: caster.x + THORNBINDER_TARGETING_RANGE * 2, y: caster.y };
        const activeAbility: ActiveAbility = {
            abilityId: THORNBINDER_ABILITY_ID,
            startTime: 0,
            targets: [{ type: 'pixel', position: far }],
        };
        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderActivePreview!(gr, caster, activeAbility, 0.1);
        const landing = { x: caster.x + THORNBINDER_TARGETING_RANGE, y: caster.y };
        expect(gr.filledTiles).toEqual(keysOf(resolveThornbinderImpactCells(landing)));
    });
});

describe('ThornbinderBrambleAbility renderProjectilePreview (in-flight, projectile-driven)', () => {
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

    it('telegraphs the exact tiles around the reconstructed landing spot, not the projectile position', () => {
        const proj = makeInFlightProjectile(THORNBINDER_TARGETING_RANGE / 2);
        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderProjectilePreview!(gr, proj, 0);

        const landing = { x: 100 + THORNBINDER_TARGETING_RANGE, y: 300 };
        expect(gr.filledTiles).toEqual(keysOf(resolveThornbinderImpactCells(landing)));
        const landingTile = worldToTile(landing.x, landing.y);
        expect(gr.filledTiles.has(`${landingTile.col},${landingTile.row}`)).toBe(true);
    });

    it('keeps rendering when the launching unit has been interrupted or killed', () => {
        // renderProjectilePreview only reads the Projectile, so a dead/absent caster changes nothing.
        const proj = makeInFlightProjectile(250);
        const gr = makeGraphicsRecorder();
        ThornbinderBrambleAbility.renderProjectilePreview!(gr, proj, 999);
        expect(gr.filledTiles.size).toBeGreaterThan(0);
    });

    it('keeps the base radius constant exported for VFX sizing', () => {
        expect(THORNBINDER_BASE_RADIUS).toBe(95);
    });
});

