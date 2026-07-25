import { LightSource } from '../game/lightSources/LightSource';
import type { AbilityEngineContext } from './AbilityEngineContext';
import type { LightType } from '../game/lighting/lightTypes';
import { DEFAULT_LIGHT_TYPE } from '../game/lighting/lightTypes';

export type EngineWithLight = AbilityEngineContext & { addLightSource(ls: LightSource): void };

export interface BrightDef {
    lightAmount: number;
    radius: number;
    roundsTotal?: number;
    decayRate?: number;
    decayInterval?: number;
}

export const BRIGHT_DEFS: Readonly<Record<number, BrightDef>> = {
    2: { lightAmount: 10, radius: 2, decayRate: 1, decayInterval: 0.08 },
    3: { lightAmount: 4, radius: 2, roundsTotal: 3 },
};

export function spawnBrightLight(
    eng: EngineWithLight,
    x: number,
    y: number,
    magnitude: number,
    colorOrOpts?: number | { color?: number; lightType?: LightType },
): void {
    const def = BRIGHT_DEFS[magnitude];
    if (!def) return;
    const opts =
        typeof colorOrOpts === 'number'
            ? { color: colorOrOpts, lightType: DEFAULT_LIGHT_TYPE }
            : {
                  color: colorOrOpts?.color,
                  lightType: colorOrOpts?.lightType ?? DEFAULT_LIGHT_TYPE,
              };
    eng.addLightSource(new LightSource({
        x,
        y,
        lightAmount: def.lightAmount,
        radius: def.radius,
        color: opts.color,
        lightType: opts.lightType,
        decay: def.roundsTotal != null
            ? {
                roundCreated: eng.roundNumber ?? 1,
                initialLightAmount: def.lightAmount,
                initialRadius: def.radius,
                roundsTotal: def.roundsTotal,
            }
            : {
                roundCreated: 0,
                initialLightAmount: def.lightAmount,
                initialRadius: def.radius,
                roundsTotal: 999,
                decayRate: def.decayRate ?? 1,
                decayInterval: def.decayInterval ?? 0.25,
            },
    }));
}
