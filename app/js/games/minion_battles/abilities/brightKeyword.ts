import { LightSource } from '../game/lightSources/LightSource';
import type { AbilityEngineContext } from './AbilityEngineContext';
import type { LightType } from '../game/lighting/lightTypes';
import { DEFAULT_LIGHT_TYPE } from '../game/lighting/lightTypes';
import type { TeamId } from '../game/teams';

export type EngineWithLight = AbilityEngineContext & { addLightSource(ls: LightSource): void };

export interface BrightDef {
    lightAmount: number;
    radius: number;
}

/**
 * Bright N: brightness N + 1 at radius 2. Every Bright light loses
 * {@link BRIGHT_ROUND_END_DECAY} brightness at each round end (starting with the round it
 * was created in), keeps its radius, and is removed when brightness reaches 0.
 */
export const BRIGHT_DEFS: Readonly<Record<number, BrightDef>> = {
    1: { lightAmount: 2, radius: 2 },
    2: { lightAmount: 3, radius: 2 },
    3: { lightAmount: 4, radius: 2 },
};

/** Brightness a Bright light loses at each round end. */
export const BRIGHT_ROUND_END_DECAY = 1;

/** Deployable ownership for a bright light. Omit for ownerless (story/environment) lights. */
export interface BrightLightOwner {
    unitId: string;
    abilityId?: string;
    teamId: TeamId;
}

export function spawnBrightLight(
    eng: EngineWithLight,
    x: number,
    y: number,
    magnitude: number,
    colorOrOpts?: number | { color?: number; lightType?: LightType; visualAlphaScale?: number },
    owner?: BrightLightOwner,
): void {
    const def = BRIGHT_DEFS[magnitude];
    if (!def) return;
    const opts =
        typeof colorOrOpts === 'number'
            ? { color: colorOrOpts, lightType: DEFAULT_LIGHT_TYPE }
            : {
                  visualAlphaScale: colorOrOpts?.visualAlphaScale,
                  color: colorOrOpts?.color,
                  lightType: colorOrOpts?.lightType ?? DEFAULT_LIGHT_TYPE,
              };
    eng.addLightSource(new LightSource({
        x,
        y,
        lightAmount: def.lightAmount,
        radius: def.radius,
        visualAlphaScale: opts.visualAlphaScale,
        color: opts.color,
        lightType: opts.lightType,
        ownerUnitId: owner?.unitId,
        ownerAbilityId: owner?.abilityId,
        teamId: owner?.teamId,
        decay: {
            roundCreated: eng.roundNumber ?? 1,
            initialLightAmount: def.lightAmount,
            initialRadius: def.radius,
            // Round ends survived before reaching 0 (informational; roundStepDecay drives removal).
            roundsTotal: Math.ceil(def.lightAmount / BRIGHT_ROUND_END_DECAY),
            roundStepDecay: BRIGHT_ROUND_END_DECAY,
        },
    }));
}
