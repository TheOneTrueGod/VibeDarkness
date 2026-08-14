import type { AbilityStatic } from './Ability';
import { AbilityPhase, type AbilityTimingEntry } from './abilityTimings';
import type { Unit } from '../game/units/Unit';

const WAIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`;

export const WAIT_ABILITY_MODE_SHORT = 'short';
export const WAIT_ABILITY_MODE_MEDIUM = 'medium';
export const WAIT_ABILITY_MODE_FAR = 'far';

/** Default wait mode when the player has not chosen S / M / F. */
export const WAIT_ABILITY_DEFAULT_MODE = WAIT_ABILITY_MODE_SHORT;

export const WAIT_ABILITY_MODES = [
    WAIT_ABILITY_MODE_SHORT,
    WAIT_ABILITY_MODE_MEDIUM,
    WAIT_ABILITY_MODE_FAR,
] as const;

/** Short UI labels for the segmented wait toggle (S / M / F). */
export const WAIT_ABILITY_MODE_LABELS: Readonly<Record<(typeof WAIT_ABILITY_MODES)[number], string>> = {
    [WAIT_ABILITY_MODE_SHORT]: 'S',
    [WAIT_ABILITY_MODE_MEDIUM]: 'M',
    [WAIT_ABILITY_MODE_FAR]: 'F',
};

export const WAIT_DURATION_SHORT_SEC = 1;
export const WAIT_DURATION_MEDIUM_SEC = 2;
export const WAIT_DURATION_FAR_MIN_SEC = 1;
/** Safety cap so a far wait cannot stall a battle forever if neither end condition fires. */
export const WAIT_DURATION_FAR_MAX_SEC = 120;

export interface WaitOrderWindow {
    minSec: number;
    maxSec: number;
}

/** Resolve min/max wait lockout seconds from a committed ability mode. */
export function resolveWaitOrderWindow(mode: string | undefined): WaitOrderWindow {
    switch (mode) {
        case WAIT_ABILITY_MODE_SHORT:
            return { minSec: WAIT_DURATION_SHORT_SEC, maxSec: WAIT_DURATION_SHORT_SEC };
        case WAIT_ABILITY_MODE_FAR:
            return { minSec: WAIT_DURATION_FAR_MIN_SEC, maxSec: WAIT_DURATION_FAR_MAX_SEC };
        case WAIT_ABILITY_MODE_MEDIUM:
            return { minSec: WAIT_DURATION_MEDIUM_SEC, maxSec: WAIT_DURATION_MEDIUM_SEC };
        default:
            return { minSec: WAIT_DURATION_SHORT_SEC, maxSec: WAIT_DURATION_SHORT_SEC };
    }
}

export function waitTimingsForMode(mode: string | undefined): AbilityTimingEntry[] {
    const { maxSec } = resolveWaitOrderWindow(mode);
    return [
        {
            id: 'wait',
            start: 0,
            end: maxSec,
            abilityPhase: AbilityPhase.Waiting,
            timelineLabel: 'Waiting',
            timelineDescription: 'Holding position.',
        },
    ];
}

function resolveWaitModeFromCaster(caster?: Unit): string | undefined {
    if (caster?.waitAbilityMode) return caster.waitAbilityMode;
    return WaitAbility.abilityModes?.defaultMode;
}

export const WaitAbility: AbilityStatic = {
    id: 'wait',
    name: 'Wait',
    image: WAIT_ICON,
    resourceCost: null,
    rechargeTurns: 0,
    targets: [],
    prefireTime: 0,
    abilityModes: {
        modes: WAIT_ABILITY_MODES,
        defaultMode: WAIT_ABILITY_DEFAULT_MODE,
        toggleStyle: 'segmentedAbove',
        modeLabels: WAIT_ABILITY_MODE_LABELS,
    },
    abilityTimings: waitTimingsForMode(WAIT_ABILITY_DEFAULT_MODE),
    getAbilityTimings: (caster) => waitTimingsForMode(resolveWaitModeFromCaster(caster as Unit | undefined)),
    getTooltipText: () => [
        'Hold position for a short time.',
        'S: 1 second. M: 2 seconds. F: until you arrive or take enemy damage (min 1s).',
    ],
    getAbilityStates: () => [],
    onAttackBlocked: () => {},
};
