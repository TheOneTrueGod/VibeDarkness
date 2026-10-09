import './AbilityRegistry';
import { describe, expect, it } from 'vitest';
import { RockSlideAbility_0537 } from '../card_defs/05_earth_core/0537_RockSlide/0537Ability';
import type { GameEngine } from '../game/GameEngine';
import type { HitboxPreviewCaster } from '../hitboxes/Hitbox';
import { nullHitbox } from '../hitboxes/HitboxSpec';
import { tileAreaHitbox, tileShapes } from '../hitboxes/TileAreaHitboxSpec';
import type { IAbilityPreviewGraphics } from './Ability';
import { buildAiSelectTargets } from './targeting';
import { worldToTile, tileCentre } from './tileAreaHelpers';
import { TerrainType } from '../terrain/TerrainType';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { earthCoreRockSlideScenario, ROCK_SLIDE_SCENARIO_ROCK_TILE } from '../testing/scenarios/abilities/earthCoreScenarios';

/** Mirrors the headless runner: once nobody is mid-cast the engine waits for orders, so answer with a wait. */
function resolveOrderPause(engine: GameEngine): void {
    const batch = engine.waitingForOrders;
    if (!batch) return;
    for (const waiter of batch.waiters) {
        engine.state.orderMgr.applyOrder({ unitId: waiter.unitId, abilityId: 'wait', targets: [], endTurn: true });
    }
    engine.tryResumeParallel();
}

function tick(engine: GameEngine): void {
    resolveOrderPause(engine);
    engine.stepSimulationFixedTicks(1);
}

/** Graphics stub that records which primitives were called, in order. */
function recordingGraphics(): { gr: IAbilityPreviewGraphics; calls: string[] } {
    const calls: string[] = [];
    const gr = {
        clear: () => calls.push('clear'),
        moveTo: () => calls.push('moveTo'),
        lineTo: () => calls.push('lineTo'),
        circle: () => calls.push('circle'),
        fill: () => calls.push('fill'),
        stroke: () => calls.push('stroke'),
    };
    return { gr: gr as unknown as IAbilityPreviewGraphics, calls };
}

describe('AI select plans respect validatePick', () => {
    it('marks the Rock Slide plan unusable when the enemy is not on a rock within reach', () => {
        const engine = earthCoreRockSlideScenario.buildEngine() as GameEngine;
        const player = engine.getLocalPlayerUnit()!;
        const dummy = engine.getUnit('target_dummy')!;
        const dummyTile = worldToTile(dummy.x, dummy.y);
        // Precondition: the enemy stands on grass, so the rock pick must be rejected.
        expect(engine.terrainManager!.getEffectiveTerrainType(dummyTile.col, dummyTile.row)).not.toBe(TerrainType.Rock);

        const built = buildAiSelectTargets(player, RockSlideAbility_0537, dummy, engine);
        expect(built.targets).toHaveLength(2);
        expect(built.valid).toBe(false);
    });
});

describe('Rock Slide fizzles when its committed rock is gone', () => {
    it('a committed rock pick that is no longer rock ends the cast with no projectile', () => {
        const engine = earthCoreRockSlideScenario.buildEngine() as GameEngine;
        const { col, row } = ROCK_SLIDE_SCENARIO_ROCK_TILE;
        expect(engine.terrainManager!.getEffectiveTerrainType(col, row)).toBe(TerrainType.Rock);
        // The rock is removed before the order runs, so the committed pick is illegal when its interval enters.
        expect(engine.terrainManager!.destroyRock(col, row)).not.toBeNull();

        for (const order of earthCoreRockSlideScenario.getInitialOrders(engine)) {
            engine.state.orderMgr.applyOrder(order);
        }
        for (let i = 0; i < 5; i++) tick(engine);

        const player = engine.getLocalPlayerUnit()!;
        expect(player.activeAbilities.some((a) => a.abilityId === '0537')).toBe(false);
        expect(engine.projectiles.filter((p) => p.active)).toHaveLength(0);
        expect(engine.terrainManager!.getEffectiveTerrainType(col, row)).not.toBe(TerrainType.Rock);
    });
});

describe('invalid pick previews', () => {
    const caster = { x: 3 * CELL_SIZE + CELL_SIZE / 2, y: 5 * CELL_SIZE + CELL_SIZE / 2 } as unknown as HitboxPreviewCaster;

    it('a tile-area hitbox greys its cells and draws a cross without clearing the layer', () => {
        const hitbox = tileAreaHitbox({
            anchor: { kind: 'chebyshev', maxTileOffset: 2 },
            shape: tileShapes.single(),
            castRange: 2 * CELL_SIZE,
        });
        const aim = tileCentre({ col: 5, row: 5 });
        const { gr, calls } = recordingGraphics();

        hitbox.renderInvalidPreview(gr, caster, aim);

        expect(calls).not.toContain('clear');
        // One filled cell, then the outline stroke and the cross stroke.
        expect(calls.filter((c) => c === 'fill')).toHaveLength(1);
        expect(calls.filter((c) => c === 'stroke').length).toBeGreaterThanOrEqual(2);
    });

    it('the default hitbox preview draws only a cross at the aim point', () => {
        const { gr, calls } = recordingGraphics();

        nullHitbox.renderInvalidPreview(gr, caster, { x: 10, y: 10 });

        expect(calls).not.toContain('clear');
        expect(calls).not.toContain('fill');
        expect(calls.filter((c) => c === 'stroke')).toHaveLength(1);
    });
});
