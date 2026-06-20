/**
 * LightSource — A persistent in-game light emitter (e.g. a thrown torch on the ground).
 *
 * Distinct from the LightGrid computation input {@link GridLightInput}.
 * LightSources are serialized as part of game state and drive the LightGrid.
 */

import type { OverlapMethod } from '../LightGrid';

let _lightSourceCounter = 0;
function generateLightSourceId(): string {
    return `ls_${++_lightSourceCounter}`;
}

export interface LightSourceDecay {
    roundCreated: number;
    initialLightAmount: number;
    initialRadius: number;
    roundsTotal: number;
    decayRate?: number;
    decayInterval?: number;
    lightDecayNextAtRound?: number;
    /** If true, skip linear fade — source holds full emission/radius until roundsTotal, then vanishes. */
    noDecay?: boolean;
}

export class LightSource {
    id: string;
    x: number;
    y: number;
    active: boolean = true;
    lightAmount: number;
    radius: number;
    color?: number;
    followUnitId?: string;
    decay: LightSourceDecay;
    overlapMethod?: OverlapMethod;

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        lightAmount: number;
        radius: number;
        color?: number;
        followUnitId?: string;
        decay: LightSourceDecay;
        overlapMethod?: OverlapMethod;
    }) {
        this.id = config.id ?? generateLightSourceId();
        this.x = config.x;
        this.y = config.y;
        this.lightAmount = config.lightAmount;
        this.radius = config.radius;
        this.color = config.color;
        this.followUnitId = config.followUnitId;
        this.decay = { ...config.decay };
        this.overlapMethod = config.overlapMethod;
    }

    toJSON(): Record<string, unknown> {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            active: this.active,
            lightAmount: this.lightAmount,
            radius: this.radius,
            ...(this.color !== undefined ? { color: this.color } : {}),
            ...(this.followUnitId !== undefined ? { followUnitId: this.followUnitId } : {}),
            decay: { ...this.decay },
        };
    }

    static fromJSON(data: Record<string, unknown>): LightSource {
        const ls = new LightSource({
            id: data.id as string,
            x: data.x as number,
            y: data.y as number,
            lightAmount: data.lightAmount as number,
            radius: data.radius as number,
            color: data.color as number | undefined,
            followUnitId: data.followUnitId as string | undefined,
            decay: data.decay as LightSourceDecay,
        });
        ls.active = data.active as boolean;
        return ls;
    }
}
