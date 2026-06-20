import type { WorldModifierDef } from '../types';

export interface DarkSwarmModifierOptions {
    lightAmount?: number;
    radius?: number;
    durationRounds?: number;
    /** Character id whose deaths trigger the dark aura. Default `'swarmling'`. */
    characterId?: string;
}

const DARK_SWARM_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#0d0024"/><ellipse cx="9" cy="9" rx="2.5" ry="2" fill="#6b21a8"/><ellipse cx="15" cy="9" rx="2" ry="1.5" fill="#6b21a8"/><ellipse cx="12" cy="15" rx="3" ry="2" fill="#6b21a8"/><ellipse cx="7" cy="14" rx="1.5" ry="1.5" fill="#6b21a8"/><ellipse cx="17" cy="14" rx="1.5" ry="1.5" fill="#6b21a8"/></svg>';

/** Dark Swarm: victim deaths leave a pocket of darkness for several rounds. */
export function darkSwarmModifier(opts: DarkSwarmModifierOptions = {}): WorldModifierDef {
    const {
        lightAmount = -1,
        radius = 2,
        durationRounds = 5,
        characterId = 'swarmling',
    } = opts;

    return {
        id: 'dark_swarm',
        name: 'Dark Swarm',
        description: 'When a Swarmling dies, it releases a burst of darkness at its death site for 5 rounds.',
        icon: DARK_SWARM_ICON,
        rules: {
            on_unit_died: [
                {
                    conditions: [{ type: 'victimCharacterIdIs', characterId }],
                    effects: [
                        {
                            type: 'spawnLightSource',
                            lightAmount,
                            radius,
                            durationRounds,
                            position: 'victim',
                            overlapMethod: { method: 'add', contributionDR: 0.9 },
                            noDecay: true,
                        },
                    ],
                },
            ],
        },
    };
}
