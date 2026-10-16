import { describe, expect, it, vi } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { StoneTomb } from './0530Ability';
import { Unit } from '../../../game/units/Unit';
import { EventBus } from '../../../game/EventBus';
import type { ResolvedTarget } from '../../../game/types';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { CastBehaviourTickContext } from '../../../abilities/castBehaviourTypes';
import {
    getEffectiveCastBehaviours,
    isAbilityTimingInterval,
    type AbilityTimingInterval,
} from '../../../abilities/abilityTimings';
import { getTileAreaEdges } from '../../../abilities/tileAreaHelpers';
import { tileAreaHitbox, tileShapes } from '../../../hitboxes/TileAreaHitboxSpec';
import {
    STONE_TOMB_STAGE1_DAMAGE,
    STONE_TOMB_STAGE2_DAMAGE,
    STONE_TOMB_STAGE1_TIME,
    STONE_TOMB_PICK_TIME,
    STONE_TOMB_PICK_END,
    STONE_TOMB_PUNCH_LEAD,
    STONE_TOMB_STAGE_GAP,
    STONE_TOMB_ROCK_COST,
    STONE_TOMB_MAX_TILE_OFFSET,
} from '../earthCoreConstants';
import type { Effect } from '../../../game/effects/Effect';
import type { GameEngine } from '../../../game/GameEngine';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { FIXED_DT } from '../../../game/gameConstants';
import { TerrainType } from '../../../terrain/TerrainType';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { earthCoreStoneTombScenario } from '../../../testing/scenarios/abilities/earthCoreScenarios';

const CELL = 40;
const center = (col: number, row: number) => ({ x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 });

function makeUnit(id: string, teamId: 'player' | 'enemy', col: number, row: number): Unit {
    const { x, y } = center(col, row);
    const u = new Unit({
        x, y, hp: 100, speed: 100, teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: teamId === 'player' ? 'player' : 'dark_wolf',
        name: id,
    });
    return u;
}

function setup(units: Unit[], terrainLayers?: TerrainLayerManager) {
    const createOrMarkRock = vi.fn();
    const createRubble = vi.fn();
    const engine = {
        terrainLayers,
        units,
        gameTime: 0,
        roundNumber: 1,
        eventBus: new EventBus(),
        getUnit: (id: string) => units.find((u) => u.id === id),
        addEffect: () => {},
        terrainManager: { createOrMarkRock, createRubble },
    } as unknown as AbilityEngineContext;
    return { engine, createOrMarkRock, createRubble };
}

const target = (col: number, row: number): ResolvedTarget[] => [
    { type: 'pixel', position: center(col, row) } as ResolvedTarget,
];

function intervalById(id: string): AbilityTimingInterval {
    const found = StoneTomb.abilityTimings.find(
        (e): e is AbilityTimingInterval => isAbilityTimingInterval(e) && e.id === id,
    );
    if (!found) throw new Error(`Stone Tomb has no interval "${id}"`);
    return found;
}

/** Runs an interval's cast behaviours on its first tick, as the engine does when the window is entered. */
function enterInterval(id: string, engine: AbilityEngineContext, caster: Unit, targets: ResolvedTarget[]): void {
    for (const entry of getEffectiveCastBehaviours(intervalById(id)) ?? []) {
        const ctx: CastBehaviourTickContext = {
            caster,
            abilityId: '0530',
            target: targets[0],
            allTargets: targets,
            castPayload: {},
            behaviourPayload: undefined,
            setBehaviourPayload: () => {},
            engine,
            windowProgress: 0,
            prevWindowProgress: 0,
            isFirstTick: true,
            isLastTick: false,
        };
        entry.behaviour.onTick?.(ctx);
    }
}

describe('Stone Tomb (0530)', () => {
    it('plus geometry: 5 cells and a 12-edge perimeter', () => {
        const plus = tileAreaHitbox({
            anchor: { kind: 'chebyshev', maxTileOffset: 4 },
            shape: tileShapes.plus(),
            castRange: 220,
        });
        const cells = plus.cellsAround({ col: 5, row: 5 });
        expect(cells).toHaveLength(5);
        expect(cells[0]).toEqual({ col: 5, row: 5 });
        expect(getTileAreaEdges(cells).outer).toHaveLength(12);
    });

    it('winds up, picks the tomb as late as possible (as punch 1 starts), then lands two punches 0.3s apart', () => {
        const windup = intervalById('windup');
        expect(windup.start).toBe(0);
        expect(windup.targetDef).toBeUndefined();

        const pick = intervalById('pickTomb');
        expect(pick.start).toBe(windup.end);
        expect(pick.start).toBeCloseTo(STONE_TOMB_STAGE1_TIME - STONE_TOMB_PUNCH_LEAD);
        expect(pick.start).toBeGreaterThan(0); // gated mid-cast select, not a deferred t=0 pick
        expect(pick.end).toBe(STONE_TOMB_PICK_END);
        expect(pick.targetDef).toMatchObject({ kind: 'select', label: 'Tomb location' });
        // Nothing between the pick and stage 1 except the slide-in.
        expect(intervalById('punch1').start).toBe(pick.end);

        const stage1 = intervalById('stage1');
        const stage2 = intervalById('stage2');
        expect(stage1.start).toBe(STONE_TOMB_STAGE1_TIME);
        expect(stage2.start - stage1.start).toBeCloseTo(0.3);
        expect(STONE_TOMB_STAGE_GAP).toBe(0.3);
        for (const id of ['punch1', 'stage1', 'punch2', 'stage2']) {
            expect(intervalById(id).targetDef).toEqual({ kind: 'hit', labels: ['Tomb location'] });
        }
        // Each strike's interval is preceded by a slide-in that ends exactly at the strike.
        expect(intervalById('punch1').end).toBe(stage1.start);
        expect(intervalById('punch2').end).toBe(stage2.start);
    });

    it('costs 3 rock and has 2 uses', () => {
        expect(StoneTomb.resourceCost).toEqual({ resourceId: 'rock', amount: STONE_TOMB_ROCK_COST });
        expect(STONE_TOMB_ROCK_COST).toBe(2);
        expect(StoneTomb.maxUses).toBe(2);
    });

    function rumbleTiles(intervalId: string, caster: Unit, targets: ResolvedTarget[]): string[] {
        const effects: Effect[] = [];
        const { engine } = setup([caster]);
        (engine as unknown as { addEffect: (e: Effect) => void }).addEffect = (e) => effects.push(e);
        const rumble = getEffectiveCastBehaviours(intervalById(intervalId))![1]!.behaviour;
        rumble.onTick!({
            caster,
            abilityId: '0530',
            target: targets[0]!,
            allTargets: targets,
            castPayload: {},
            behaviourPayload: undefined,
            setBehaviourPayload: () => {},
            engine,
            windowProgress: 0.01,
            prevWindowProgress: 0,
            isFirstTick: true,
            isLastTick: false,
        });
        expect(effects.length).toBeGreaterThan(0);
        expect(effects.every((e) => e.effectType === 'RockChipParticle')).toBe(true);
        return [...new Set(effects.map((e) => `${Math.floor(e.x / CELL)},${Math.floor(e.y / CELL)}`))].sort();
    }

    it('the windup rumbles on the caster tile (no target yet), then the marked tiles rumble after the pick', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        expect(rumbleTiles('windup', caster, [])).toEqual(['5,9']);
        expect(rumbleTiles('punch1', caster, target(5, 5))).toEqual(['4,5', '5,4', '5,5', '5,6', '6,5']);
    });

    it('ITS pauses for the tomb pick just before stage 1, with nothing hit yet; the strikes land after the pick', () => {
        const engine = earthCoreStoneTombScenario.buildEngine() as GameEngine;
        const player = engine.getLocalPlayerUnit()!;
        const dummy = engine.getUnit('target_dummy')!;
        const tm = engine.terrainManager!;

        executeUnitAbility(player, StoneTomb, [], engine);
        const active = player.activeAbilities.find((a) => a.abilityId === '0530')!;
        active.targetsByLabel = {};
        const start = active.startTime;
        const tick = (): void => {
            resolveParallelOrderPause(engine);
            engine.stepSimulationFixedTicks(1);
        };

        let guard = 0;
        while (!engine.waitingForTargetInput && guard++ < 300) tick();

        expect(engine.waitingForTargetInput?.label).toBe('Tomb location');
        const elapsed = engine.gameTime - start;
        expect(elapsed).toBeGreaterThanOrEqual(STONE_TOMB_PICK_TIME - 1e-6);
        expect(elapsed).toBeLessThan(STONE_TOMB_PICK_TIME + 2 * FIXED_DT);
        expect(dummy.hp).toBe(dummy.maxHp);
        expect(tm.getEffectiveTerrainType(5, 5)).not.toBe(TerrainType.Rock);

        engine.waitingForTargetInput = null;
        active.targetsByLabel = { 'Tomb location': { type: 'pixel', position: { x: dummy.x, y: dummy.y } } };
        guard = 0;
        while (engine.gameTime - start < STONE_TOMB_STAGE1_TIME + STONE_TOMB_STAGE_GAP + 0.1 && guard++ < 300) tick();

        expect(dummy.maxHp - dummy.hp).toBeGreaterThanOrEqual(STONE_TOMB_STAGE1_DAMAGE);
        expect(tm.getEffectiveTerrainType(5, 5)).toBe(TerrainType.Rock);
    });

    it('stage 1 damages only centre-tile enemies and raises only the centre rock', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const inCenter = makeUnit('a', 'enemy', 5, 5);
        const inArm = makeUnit('b', 'enemy', 6, 5);
        const { engine, createOrMarkRock } = setup([caster, inCenter, inArm]);
        enterInterval('stage1', engine, caster, target(5, 5));
        expect(inCenter.hp).toBe(100 - STONE_TOMB_STAGE1_DAMAGE);
        expect(inArm.hp).toBe(100);
        expect(createOrMarkRock).toHaveBeenCalledTimes(1);
        expect(createOrMarkRock).toHaveBeenCalledWith(5, 5);
    });

    it('stage 1 knocks back allies in the centre tile without damaging them', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const ally = makeUnit('al', 'player', 5, 5);
        const enemy = makeUnit('a', 'enemy', 5, 5);
        enemy.x += 10;
        ally.x -= 10;
        const { engine } = setup([caster, ally, enemy]);
        enterInterval('stage1', engine, caster, target(5, 5));
        expect(ally.hp).toBe(100);
        expect(ally.knockback).not.toBeNull();
        expect(enemy.hp).toBe(100 - STONE_TOMB_STAGE1_DAMAGE);
    });

    it('stage 2 damages every plus tile (centre included) and turns the 4 outer tiles to gravel, not rock', () => {
        const caster = makeUnit('c', 'player', 5, 9);
        const inCenter = makeUnit('a', 'enemy', 5, 5);
        const inArm = makeUnit('b', 'enemy', 6, 5);
        const outside = makeUnit('d', 'enemy', 6, 6);
        const { engine, createOrMarkRock, createRubble } = setup([caster, inCenter, inArm, outside]);
        enterInterval('stage2', engine, caster, target(5, 5));
        expect(inCenter.hp).toBe(100 - STONE_TOMB_STAGE2_DAMAGE);
        expect(inArm.hp).toBe(100 - STONE_TOMB_STAGE2_DAMAGE);
        expect(outside.hp).toBe(100);
        expect(createOrMarkRock).not.toHaveBeenCalled();
        const cells = createRubble.mock.calls.map(([c, r]) => `${c},${r}`).sort();
        expect(cells).toEqual(['4,5', '5,4', '5,6', '6,5']);
    });

    describe('terrain clearing', () => {
        const PLUS = [[5, 5], [4, 5], [6, 5], [5, 4], [5, 6]] as const;

        function layersWithEffects(): TerrainLayerManager {
            const layers = new TerrainLayerManager();
            for (const [col, row] of PLUS) {
                layers.add({
                    id: `ground-${col}-${row}`,
                    layer: 'ground',
                    effectType: 'dark_thorn',
                    placedAtGameTime: 0,
                    area: { type: 'cell', col, row },
                    params: {},
                });
            }
            layers.add({
                id: 'ground-outside',
                layer: 'ground',
                effectType: 'dark_thorn',
                placedAtGameTime: 0,
                area: { type: 'cell', col: 6, row: 6 },
                params: {},
            });
            layers.add({
                id: 'air-arm',
                layer: 'air',
                effectType: 'dark_thorn',
                placedAtGameTime: 0,
                area: { type: 'cell', col: 6, row: 5 },
                params: {},
            });
            return layers;
        }

        it('stage 1 clears only the centre tile, stage 2 the rest of the plus; air and outside tiles survive', () => {
            const caster = makeUnit('c', 'player', 5, 9);
            const layers = layersWithEffects();
            const { engine } = setup([caster], layers);

            enterInterval('stage1', engine, caster, target(5, 5));
            expect(layers.getGroundEffectAt(5, 5)).toBeNull();
            expect(layers.getGroundEffectAt(6, 5)?.id).toBe('ground-6-5');

            enterInterval('stage2', engine, caster, target(5, 5));
            for (const [col, row] of PLUS) expect(layers.getGroundEffectAt(col, row)).toBeNull();
            expect(layers.getGroundEffectAt(6, 6)?.id).toBe('ground-outside');
            expect(layers.getEffectsCoveringCell('air', 6, 5)).toHaveLength(1);
        });
    });

    it('clamps an out-of-range pick to STONE_TOMB_MAX_TILE_OFFSET (6) tiles from the caster', () => {
        expect(STONE_TOMB_MAX_TILE_OFFSET).toBe(6);
        const caster = makeUnit('c', 'player', 5, 12);
        const { engine, createOrMarkRock } = setup([caster]);
        enterInterval('stage1', engine, caster, target(5, 0));
        expect(createOrMarkRock).toHaveBeenCalledWith(5, 12 - STONE_TOMB_MAX_TILE_OFFSET);
    });
});
