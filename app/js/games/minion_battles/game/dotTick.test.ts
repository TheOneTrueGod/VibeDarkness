import { describe, expect, it } from 'vitest';
import { EventBus } from './EventBus';
import { TerrainLayerManager } from './TerrainLayerManager';
import { Unit } from './units/Unit';
import { applyBleedStack } from '../buffs/bleedRuntime';
import { BLEED_TICKS_PER_ROUND, DOT_TICKS_PER_ROUND, isBleedDotMilestone, tickAllDots } from './dotTick';
import { ROUND_DURATION } from './gameConstants';

describe('bleed DoT cadence', () => {
    it('lands once every eighth of a round', () => {
        expect(ROUND_DURATION / BLEED_TICKS_PER_ROUND).toBe(ROUND_DURATION / 8);
        expect(DOT_TICKS_PER_ROUND % BLEED_TICKS_PER_ROUND).toBe(0);

        const hits = Array.from({ length: DOT_TICKS_PER_ROUND }, (_, index) => index)
            .filter((index) => isBleedDotMilestone(index));
        expect(hits).toHaveLength(BLEED_TICKS_PER_ROUND);
        expect(hits).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('tickAllDots damages bleed only on those milestones', () => {
        const unit = new Unit({
            id: 'bleed_dot',
            x: 0,
            y: 0,
            hp: 100,
            speed: 100,
            teamId: 'enemy',
            ownerId: 'e1',
            characterId: 'player',
            portraitId: 'warrior',
            name: 'Bleed',
        });
        applyBleedStack(unit, 0, 1, DOT_TICKS_PER_ROUND);
        const eventBus = new EventBus();
        let ticks = 0;
        eventBus.on('damage_taken', () => {
            ticks += 1;
        });
        const terrain = new TerrainLayerManager();

        for (let index = 0; index < DOT_TICKS_PER_ROUND; index++) {
            tickAllDots([unit], terrain, eventBus, undefined, index);
        }

        expect(ticks).toBe(BLEED_TICKS_PER_ROUND);
    });
});
