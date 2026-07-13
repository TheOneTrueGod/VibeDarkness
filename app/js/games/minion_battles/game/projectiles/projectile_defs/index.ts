import type { IProjectileDef } from './types';
import { defaultProjectileDef } from './defaultProjectileDef';
import { chargedRockDef } from './chargedRockDef';
import { energyBlastDef } from './energyBlastDef';
import { brambleSpikeDef } from './brambleSpikeDef';
import { throwingKnifeDef } from './throwingKnifeDef';
import { torchDef } from './torchDef';
import { spriteProjectileDef } from './spriteProjectileDef';
import { bloodWaveDef } from './bloodWaveDef';

const registry: Record<string, IProjectileDef> = {
    default: defaultProjectileDef,
    charged_rock: chargedRockDef,
    energy_blast: energyBlastDef,
    bramble_spike: brambleSpikeDef,
    throwing_knife: throwingKnifeDef,
    torch: torchDef,
    sprite_projectile: spriteProjectileDef,
    blood_wave: bloodWaveDef,
};

export function getProjectileDef(type: string): IProjectileDef {
    return registry[type] ?? defaultProjectileDef;
}

export type { IProjectileDef, SpriteProjectileConfig, SpriteFramesDef, TrailDef, AnimationDef } from './types';
