import { describe, it, expect } from 'vitest';
import { EventBus } from './EventBus';
import { onRoundProgressMilestone } from './roundProgressMilestones';

describe('roundProgressMilestones', () => {
    it('invokes stamina pulse only at round_start, not at round_half', () => {
        let staminaCalls = 0;
        const ctx = {
            units: [],
            eventBus: new EventBus(),
            applyStaminaPulse: () => {
                staminaCalls++;
            },
        };

        onRoundProgressMilestone('round_start', ctx);
        expect(staminaCalls).toBe(1);

        onRoundProgressMilestone('round_half', ctx);
        expect(staminaCalls).toBe(1);
    });
});
