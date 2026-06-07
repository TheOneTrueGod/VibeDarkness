import { describe, it, expect } from 'vitest';
import { EventBus } from './EventBus';
import { Unit } from './units/Unit';
import { onRoundProgressMilestone } from './roundProgressMilestones';
import { applyBleedStack } from '../buffs/bleedRuntime';

describe('roundProgressMilestones', () => {
    it('ticks bleed at round_start and round_half (round-start unit pulses live in UnitManager.onRoundStart)', () => {
        const unit = new Unit({
            id: 'u1',
            x: 0,
            y: 0,
            hp: 100,
            maxHp: 100,
            speed: 50,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Hero',
        });
        applyBleedStack(unit, 0, 1, 2);

        let damageEvents = 0;
        const eventBus = new EventBus();
        eventBus.on('damage_taken', () => {
            damageEvents++;
        });

        const ctx = {
            units: [unit],
            eventBus,
        };

        onRoundProgressMilestone('round_start', ctx);
        expect(damageEvents).toBe(1);

        onRoundProgressMilestone('round_half', ctx);
        expect(damageEvents).toBe(2);
    });
});
