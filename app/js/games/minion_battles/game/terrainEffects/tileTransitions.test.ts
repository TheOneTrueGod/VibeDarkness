import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus } from '../EventBus';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Unit } from '../units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../units/unit_defs/unitConstants';
import type { TeamId } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { DOT_TICKS_PER_ROUND, tickAllDots } from '../dotTick';
import {
    BRAMBLE_SLOW_EFFECT_TYPE,
    DARK_THORN_EFFECT_TYPE,
    DARK_THORN_ENTER_DAMAGE,
    DARK_THORN_LAND_DAMAGE,
    THORN_ENTER_DAMAGE,
    THORN_LAND_DAMAGE,
} from './terrainEffectDefs';
import {
    clearUnitTileTransitionState,
    getOnLeaveInvocationCount,
    processUnitTileTransition,
    resetOnLeaveInvocationCount,
} from './tileTransitions';

function makeUnit(opts: { id: string; characterId: string; x: number; y: number; hp?: number }): Unit {
    return new Unit({
        id: opts.id,
        x: opts.x,
        y: opts.y,
        hp: opts.hp ?? 100,
        maxHp: opts.hp ?? 100,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'ai',
        characterId: opts.characterId,
        name: opts.id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

function placeThorn(
    terrainLayers: TerrainLayerManager,
    effectType: string,
    col: number,
    row: number,
): void {
    terrainLayers.add({
        id: `${effectType}-${col}-${row}`,
        layer: 'ground',
        effectType,
        placedAtGameTime: 0,
        area: { type: 'cell', col, row },
        params: {},
        ownerUnitId: 'owner',
    });
}

function makeEngine(units: Unit[], terrainLayers: TerrainLayerManager) {
    return {
        units,
        terrainLayers,
        eventBus: new EventBus(),
    };
}

function putAirborne(unit: Unit, elapsed = 0.1): void {
    unit.knockback = {
        knockbackVector: { x: CELL_SIZE, y: 0 },
        knockbackAirTime: 0.5,
        knockbackSlideTime: 0.2,
        knockbackSource: { unitId: 'src', abilityId: 'test' },
        knockbackElapsed: elapsed,
    };
}

interface ThornCase {
    effectType: string;
    /** characterId the thorns hurt. */
    victim: string;
    /** characterId the thorns ignore. */
    immune: string;
    enter: number;
    land: number;
}

// `player` has no creatureType (not a dark_creature); `dark_wolf` is a dark_creature.
const CASES: ThornCase[] = [
    {
        effectType: BRAMBLE_SLOW_EFFECT_TYPE,
        victim: 'dark_wolf',
        immune: 'player',
        enter: THORN_ENTER_DAMAGE,
        land: THORN_LAND_DAMAGE,
    },
    {
        effectType: DARK_THORN_EFFECT_TYPE,
        victim: 'player',
        immune: 'dark_wolf',
        enter: DARK_THORN_ENTER_DAMAGE,
        land: DARK_THORN_LAND_DAMAGE,
    },
];

describe.each(CASES)('thorns: $effectType', (c) => {
    beforeEach(() => {
        clearUnitTileTransitionState();
        resetOnLeaveInvocationCount();
    });

    const spawn = (characterId: string) =>
        makeUnit({ id: 'u1', characterId, x: CELL_SIZE * 0.5, y: CELL_SIZE * 0.5 });

    it('damages its target class on enter and is consumed', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, c.effectType, 1, 0);
        const unit = spawn(c.victim);
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine); // seed
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100 - c.enter);
        expect(terrainLayers.getGroundEffectAt(1, 0)).toBeNull();
        expect(getOnLeaveInvocationCount()).toBe(1);
    });

    it('deals land damage (not enter + land) and is consumed', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, c.effectType, 1, 0);
        const unit = spawn(c.victim);
        putAirborne(unit);
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine); // seed airborne at col 0
        unit.x = CELL_SIZE * 1.5;
        unit.knockback!.knockbackElapsed = 0.6; // past airTime -> grounded
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100 - c.land);
        expect(terrainLayers.getGroundEffectAt(1, 0)).toBeNull();
    });

    it('ignores its immune class on enter and land, and is not consumed', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, c.effectType, 1, 0);
        placeThorn(terrainLayers, c.effectType, 3, 0);
        const unit = spawn(c.immune);
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine);
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);
        expect(unit.hp).toBe(100);
        expect(terrainLayers.getGroundEffectAt(1, 0)).not.toBeNull();

        putAirborne(unit);
        unit.x = CELL_SIZE * 2.5;
        processUnitTileTransition(unit, engine); // now airborne
        unit.x = CELL_SIZE * 3.5;
        unit.knockback!.knockbackElapsed = 0.6;
        processUnitTileTransition(unit, engine); // lands on col 3
        expect(unit.hp).toBe(100);
        expect(terrainLayers.getGroundEffectAt(3, 0)).not.toBeNull();
    });

    it('does not trigger while airborne over the cell', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, c.effectType, 1, 0);
        placeThorn(terrainLayers, c.effectType, 2, 0);
        const unit = spawn(c.victim);
        putAirborne(unit);
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine); // seed airborne
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);
        unit.x = CELL_SIZE * 2.5;
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100);
        expect(terrainLayers.getGroundEffectAt(1, 0)).not.toBeNull();
        expect(getOnLeaveInvocationCount()).toBe(2);
    });

    it('deals no damage to a unit standing on it across DoT milestones', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, c.effectType, 0, 0);
        const unit = spawn(c.victim);
        const eventBus = new EventBus();

        for (let i = 0; i < DOT_TICKS_PER_ROUND; i++) {
            tickAllDots([unit], terrainLayers, eventBus, undefined, i);
        }

        expect(unit.hp).toBe(100);
        expect(terrainLayers.getGroundEffectAt(0, 0)).not.toBeNull();
    });
});
