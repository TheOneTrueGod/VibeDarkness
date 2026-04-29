import { describe, it, expect } from 'vitest';
import { EventBus } from './EventBus';
import { onRoundProgressMilestone } from './roundProgressMilestones';

describe('roundProgressMilestones', () => {
    it('invokes stamina and round charge pulses only at round_start, not at round_half', () => {
        let staminaCalls = 0;
        let roundChargeCalls = 0;
        const ctx = {
            units: [],
            eventBus: new EventBus(),
            applyStaminaPulse: () => {
                staminaCalls++;
            },
            applyRoundChargePulse: () => {
                roundChargeCalls++;
            },
        };

        onRoundProgressMilestone('round_start', ctx);
        expect(staminaCalls).toBe(1);
        expect(roundChargeCalls).toBe(1);

        onRoundProgressMilestone('round_half', ctx);
        expect(staminaCalls).toBe(1);
        expect(roundChargeCalls).toBe(1);
    });
});
