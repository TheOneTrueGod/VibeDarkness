/**
 * Husk Miasma: stepping into a new cell exhales one air cell of miasma — on the Husk's cell, or a
 * random free neighbour when that cell is already gassed (the same path UnitManager runs: tile transition, then the onCellEnter passive dispatch).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../../game/EventBus';
import { TerrainLayerManager } from '../../../game/TerrainLayerManager';
import { Unit } from '../../../game/units/Unit';
import type { EngineContext } from '../../../game/EngineContext';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { processUnitPassiveEvent } from '../../../abilities/passiveRunner';
import {
    clearUnitTileTransitionState,
    processUnitTileTransition,
} from '../../../game/terrainEffects/tileTransitions';
import { MIASMA_EFFECT_TYPE } from '../../../game/terrainEffects/terrainEffectDefs';
import { ENEMY_HUSK } from '../../../constants/enemyConstants';
import { MIASMA_ABILITY_ID, MIASMA_DURATION_SEC } from './1102Ability';
import '../../../abilities/AbilityRegistry';
import { pickBestAbility } from '../../../game/units/unitAI/utils';
import type { AIContext } from '../../../game/units/unitAI/types';

function makeHusk(): Unit {
    return new Unit({
        id: 'husk1',
        x: CELL_SIZE * 5.5,
        y: CELL_SIZE * 5.5,
        hp: 90,
        maxHp: 90,
        speed: 40,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'husk',
        name: 'Husk',
        abilities: [...ENEMY_HUSK.abilities],
        radius: 16,
    });
}

function makeEngine(units: Unit[]) {
    return {
        gameTime: 3,
        units,
        terrainLayers: new TerrainLayerManager(),
        terrainManager: null,
        eventBus: new EventBus(),
        addEffect: () => {},
        generateRandomInteger: (min: number) => min,
    } as unknown as EngineContext;
}

function step(unit: Unit, engine: EngineContext): void {
    if (processUnitTileTransition(unit, engine)) processUnitPassiveEvent(unit, 'onCellEnter', engine);
}

describe('Husk Miasma (1102)', () => {
    beforeEach(() => clearUnitTileTransitionState());

    it('is on the Husk spawn template', () => {
        expect(ENEMY_HUSK.abilities).toContain(MIASMA_ABILITY_ID);
    });

    it('leaves no gas until the Husk changes cell', () => {
        const husk = makeHusk();
        const engine = makeEngine([husk]);
        step(husk, engine); // seed
        husk.x += CELL_SIZE * 0.3; // same cell
        step(husk, engine);
        expect(engine.terrainLayers.allEffects.size).toBe(0);
    });

    it('exhales a single air cell on its new cell', () => {
        const husk = makeHusk();
        const engine = makeEngine([husk]);
        step(husk, engine); // seed at (5,5)
        husk.x += CELL_SIZE; // into (6,5)
        step(husk, engine);

        expect(engine.terrainLayers.allEffects.size).toBe(1);
        const rec = engine.terrainLayers.getAirEffectAt(6, 5);
        expect(rec?.effectType).toBe(MIASMA_EFFECT_TYPE);
        expect(rec?.ownerUnitId).toBe('husk1');
        expect(rec?.expiresAtGameTime).toBe(3 + MIASMA_DURATION_SEC);
    });

    it('spills into a free adjacent cell when its own cell is already gassed', () => {
        const husk = makeHusk();
        const engine = makeEngine([husk]);
        step(husk, engine); // seed at (5,5)
        husk.x += CELL_SIZE; // (6,5): gas
        step(husk, engine);
        husk.x -= CELL_SIZE; // back to (5,5): gas
        step(husk, engine);
        husk.x += CELL_SIZE; // (6,5) again: already gassed -> one neighbour instead
        step(husk, engine);

        expect(engine.terrainLayers.allEffects.size).toBe(3);
        const spilled = [...engine.terrainLayers.allEffects.values()].filter(
            (r) => r.area.type === 'cell' && !(r.area.col === 5 && r.area.row === 5) && !(r.area.col === 6 && r.area.row === 5),
        );
        expect(spilled).toHaveLength(1);
        const area = spilled[0].area as { col: number; row: number };
        expect(Math.max(Math.abs(area.col - 6), Math.abs(area.row - 5))).toBe(1);
    });

    it('spawns nothing when its cell and every neighbour are gassed', () => {
        const husk = makeHusk();
        const engine = makeEngine([husk]);
        for (let row = 4; row <= 6; row++) {
            for (let col = 5; col <= 7; col++) {
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
        step(husk, engine); // seed at (5,5)
        husk.x += CELL_SIZE; // into (6,5)
        step(husk, engine);
        expect(engine.terrainLayers.allEffects.size).toBe(9);
    });
});

describe('Husk Miasma (1102) AI', () => {
    it('is never picked as a cast: a passive has no timeline to run', () => {
        const husk = makeHusk();
        husk.abilities = [MIASMA_ABILITY_ID];
        const enemy = new Unit({
            id: 'p1',
            x: husk.x + 20,
            y: husk.y,
            hp: 50,
            maxHp: 50,
            speed: 60,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'warrior',
            name: 'Player',
            abilities: [],
            radius: 16,
        });
        const context = {
            gameTime: 3,
            gameTick: 0,
            hasLineOfSight: () => true,
            generateRandomInteger: (min: number) => min,
        } as unknown as AIContext;
        expect(pickBestAbility(husk, [enemy], context)).toBeNull();
    });
});
