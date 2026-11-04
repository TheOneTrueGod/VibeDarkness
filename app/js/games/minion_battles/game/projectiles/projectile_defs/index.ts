import type { IProjectileDef } from './types';
import { defaultProjectileDef } from './defaultProjectileDef';
import { chargedRockDef } from './chargedRockDef';
import { energyBlastDef } from './energyBlastDef';
import { brambleSpikeDef } from './brambleSpikeDef';
import { throwingKnifeDef } from './throwingKnifeDef';
import { torchDef } from './torchDef';
import { spriteProjectileDef } from './spriteProjectileDef';
import { bloodWaveDef } from './bloodWaveDef';
import { rockSlideDef } from './rockSlideDef';
import { foldedDeployableDef } from './foldedDeployableDef';
import { tetheredHookDef, TETHERED_HOOK_PROJECTILE_TYPE } from './tetheredHookDef';
import {
    DEPLOYABLE_DELIVERY_PROJECTILE_TYPE,
    LEGACY_TURRET_DELIVERY_PROJECTILE_TYPE,
} from '../../fieldObjects/deployableDefs';

const registry: Record<string, IProjectileDef> = {
    default: defaultProjectileDef,
    charged_rock: chargedRockDef,
    energy_blast: energyBlastDef,
    bramble_spike: brambleSpikeDef,
    throwing_knife: throwingKnifeDef,
    torch: torchDef,
    sprite_projectile: spriteProjectileDef,
    blood_wave: bloodWaveDef,
    rock_slide: rockSlideDef,
    [TETHERED_HOOK_PROJECTILE_TYPE]: tetheredHookDef,
    [DEPLOYABLE_DELIVERY_PROJECTILE_TYPE]: foldedDeployableDef,
    [LEGACY_TURRET_DELIVERY_PROJECTILE_TYPE]: foldedDeployableDef,
};

export function getProjectileDef(type: string): IProjectileDef {
    return registry[type] ?? defaultProjectileDef;
}

export type { IProjectileDef, SpriteProjectileConfig, DirectionBlobDef, SpriteFramesDef, TrailDef, AnimationDef } from './types';
