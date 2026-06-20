import type { WorldModifierDef } from '../types';

export interface RainyStormModifierOptions {
    id?: string;
    name?: string;
    activeFromRound?: number;
    startsDisabled?: boolean;
}

const RAINY_STORM_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#1e3a5f" rx="2"/><path d="M6 8h12v1H6zm-1 4h14v1H5zm2 4h10v1H7z" fill="#93c5fd" opacity="0.7"/></svg>';

/** Rainy Storm: ambient rain overlay stub + round-start counter for mid-battle tests. */
export function rainyStormModifier(opts: RainyStormModifierOptions = {}): WorldModifierDef {
    const {
        id = 'rainy_storm',
        name = 'Rainy Storm',
        activeFromRound,
        startsDisabled,
    } = opts;

    return {
        id,
        name,
        description: 'Heavy rain blankets the battlefield.',
        icon: RAINY_STORM_ICON,
        ...(activeFromRound !== undefined ? { activeFromRound } : {}),
        ...(startsDisabled !== undefined ? { startsDisabled } : {}),
        ambient: [{ type: 'rain_overlay' }],
        rules: {
            on_round_start: [
                {
                    conditions: [{ type: 'always' }],
                    effects: [{ type: 'incrementCounter', counterId: 'storm_ticks' }],
                },
            ],
        },
    };
}
