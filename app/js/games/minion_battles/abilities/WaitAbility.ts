import type { AbilityStatic } from './Ability';
import { AbilityPhase } from './abilityTimings';

const WAIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;

export const WaitAbility: AbilityStatic = {
    id: 'wait',
    name: 'Wait',
    image: WAIT_ICON,
    resourceCost: null,
    rechargeTurns: 0,
    targets: [],
    prefireTime: 0,
    abilityTimings: [
        { id: 'wait', start: 0, end: 1.5, abilityPhase: AbilityPhase.Waiting, timelineLabel: 'Waiting', timelineDescription: 'Holding position.' },
    ],
    getTooltipText: () => ['Hold position momentarily.'],
    getAbilityStates: () => [],
    onAttackBlocked: () => {},
};
