import { describe, expect, it, beforeEach } from 'vitest';
import { EventBus } from '../EventBus';
import { TerrainLayerManager } from '../TerrainLayerManager';
import { Unit } from '../units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../units/unit_defs/unitConstants';
import type { TeamId } from '../teams';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import {
    DOT_TICKS_PER_ROUND,
    DARK_THORN_DOT_DAMAGE_PER_HIT,
    THORN_DOT_DAMAGE_PER_HIT,
    THORN_DOT_DAMAGE_PER_ROUND,
    tickAllDots,
} from '../dotTick';
import {
    BRAMBLE_SLOW_EFFECT_TYPE,
    DARK_THORN_EFFECT_TYPE,
    DARK_THORN_ENTER_DAMAGE,
    DARK_THORN_LAND_DAMAGE,
    THORN_ENTER_DAMAGE,
    clearUnitTileTransitionState,
    getOnLeaveInvocationCount,
    processUnitTileTransition,
    resetOnLeaveInvocationCount,
} from './tileTransitions';

function makeUnit(opts: {
    id: string;
    characterId: string;
    x: number;
    y: number;
    hp?: number;
    teamId?: TeamId;
}): Unit {
    return new Unit({
        id: opts.id,
        x: opts.x,
        y: opts.y,
        hp: opts.hp ?? 100,
        maxHp: opts.hp ?? 100,
        speed: 100,
        teamId: opts.teamId ?? ('enemy' as TeamId),
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

describe('tileTransitions thorn enter/land', () => {
    beforeEach(() => {
        clearUnitTileTransitionState();
        resetOnLeaveInvocationCount();
    });

    it('deals enter damage when a grounded unit walks onto dark_thorn, then destroys that cell', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, DARK_THORN_EFFECT_TYPE, 1, 0);
        // player characterId has no creatureType → not dark_creature → takes dark_thorn
        const unit = makeUnit({
            id: 'u1',
            characterId: 'player',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
            teamId: 'player' as TeamId,
        });
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine); // seed
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100 - DARK_THORN_ENTER_DAMAGE);
        expect(terrainLayers.getGroundEffectAt(1, 0)).toBeNull();
        expect(getOnLeaveInvocationCount()).toBe(1);
    });

    it('deals enter damage when a dark_creature walks onto bramble_slow', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, BRAMBLE_SLOW_EFFECT_TYPE, 1, 0);
        const unit = makeUnit({
            id: 'wolf',
            characterId: 'dark_wolf',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
        });
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine);
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100 - THORN_ENTER_DAMAGE);
        // Player bramble thorns persist after dealing damage.
        expect(terrainLayers.getGroundEffectAt(1, 0)?.effectType).toBe(BRAMBLE_SLOW_EFFECT_TYPE);
    });

    it('skips enter damage while in knockback air phase over thorns', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, DARK_THORN_EFFECT_TYPE, 1, 0);
        placeThorn(terrainLayers, DARK_THORN_EFFECT_TYPE, 2, 0);
        const unit = makeUnit({
            id: 'u1',
            characterId: 'player',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
            teamId: 'player' as TeamId,
        });
        unit.knockback = {
            knockbackVector: { x: CELL_SIZE * 2, y: 0 },
            knockbackAirTime: 0.5,
            knockbackSlideTime: 0.2,
            knockbackSource: { unitId: 'src', abilityId: 'test' },
            knockbackElapsed: 0.1,
        };
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine); // seed airborne
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);
        unit.x = CELL_SIZE * 2.5;
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100);
        expect(getOnLeaveInvocationCount()).toBe(2);
    });

    it('deals land damage (not enter+land) when leaving knockback air on a thorn cell', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, DARK_THORN_EFFECT_TYPE, 1, 0);
        const unit = makeUnit({
            id: 'u1',
            characterId: 'player',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
            teamId: 'player' as TeamId,
        });
        unit.knockback = {
            knockbackVector: { x: CELL_SIZE, y: 0 },
            knockbackAirTime: 0.5,
            knockbackSlideTime: 0.2,
            knockbackSource: { unitId: 'src', abilityId: 'test' },
            knockbackElapsed: 0.1,
        };
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine); // seed airborne at col 0
        unit.x = CELL_SIZE * 1.5;
        unit.knockback.knockbackElapsed = 0.6; // past airTime → grounded
        processUnitTileTransition(unit, engine);

        expect(unit.hp).toBe(100 - DARK_THORN_LAND_DAMAGE);
        expect(unit.hp).not.toBe(100 - DARK_THORN_ENTER_DAMAGE - DARK_THORN_LAND_DAMAGE);
        expect(terrainLayers.getGroundEffectAt(1, 0)).toBeNull();
    });

    it('does not damage immune creature types on enter or land', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, BRAMBLE_SLOW_EFFECT_TYPE, 1, 0);
        // player is not dark_creature → immune to bramble_slow
        const unit = makeUnit({
            id: 'player',
            characterId: 'player',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
            teamId: 'player' as TeamId,
        });
        const engine = makeEngine([unit], terrainLayers);

        processUnitTileTransition(unit, engine);
        unit.x = CELL_SIZE * 1.5;
        processUnitTileTransition(unit, engine);
        expect(unit.hp).toBe(100);

        // Land on bramble as dark_creature-immune (nature lanternite) on dark_thorn
        clearUnitTileTransitionState();
        const terrain2 = new TerrainLayerManager();
        placeThorn(terrain2, DARK_THORN_EFFECT_TYPE, 0, 0);
        const wolf = makeUnit({
            id: 'wolf',
            characterId: 'dark_wolf',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
            hp: 50,
        });
        wolf.knockback = {
            knockbackVector: { x: 0, y: 0 },
            knockbackAirTime: 0.3,
            knockbackSlideTime: 0.1,
            knockbackSource: { unitId: 'src', abilityId: 'test' },
            knockbackElapsed: 0.05,
        };
        const eng2 = makeEngine([wolf], terrain2);
        processUnitTileTransition(wolf, eng2);
        wolf.knockback.knockbackElapsed = 0.4;
        processUnitTileTransition(wolf, eng2);
        expect(wolf.hp).toBe(50); // dark_creature immune to dark_thorn
    });
});

describe('thorn DoT', () => {
    it('deals THORN_DOT_DAMAGE_PER_ROUND from bramble_slow over a full set of milestones', () => {
        expect(THORN_DOT_DAMAGE_PER_ROUND).toBe(
            THORN_DOT_DAMAGE_PER_HIT * (DOT_TICKS_PER_ROUND / 2),
        );

        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, BRAMBLE_SLOW_EFFECT_TYPE, 0, 0);
        const unit = makeUnit({
            id: 'wolf',
            characterId: 'dark_wolf',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
        });
        const eventBus = new EventBus();
        const startHp = unit.hp;

        for (let i = 0; i < DOT_TICKS_PER_ROUND; i++) {
            tickAllDots([unit], terrainLayers, eventBus, undefined, i);
        }

        expect(startHp - unit.hp).toBe(THORN_DOT_DAMAGE_PER_ROUND);
        expect(terrainLayers.getGroundEffectAt(0, 0)?.effectType).toBe(BRAMBLE_SLOW_EFFECT_TYPE);
    });

    it('deals one doubled dark_thorn DoT hit then destroys that cell', () => {
        const terrainLayers = new TerrainLayerManager();
        placeThorn(terrainLayers, DARK_THORN_EFFECT_TYPE, 0, 0);
        const unit = makeUnit({
            id: 'u1',
            characterId: 'player',
            x: CELL_SIZE * 0.5,
            y: CELL_SIZE * 0.5,
            teamId: 'player' as TeamId,
        });
        const eventBus = new EventBus();
        const startHp = unit.hp;

        for (let i = 0; i < DOT_TICKS_PER_ROUND; i++) {
            tickAllDots([unit], terrainLayers, eventBus, undefined, i);
        }

        expect(startHp - unit.hp).toBe(DARK_THORN_DOT_DAMAGE_PER_HIT);
        expect(terrainLayers.getGroundEffectAt(0, 0)).toBeNull();
    });
});
