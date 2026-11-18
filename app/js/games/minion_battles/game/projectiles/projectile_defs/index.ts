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
import { arcBoltDef, ARC_BOLT_PROJECTILE_TYPE } from './arcBoltDef';
import { darkShardDef, DARK_SHARD_PROJECTILE_TYPE } from './darkShardDef';
import { burrowingDef, BURROWING_PROJECTILE_TYPE } from './burrowingDef';
import { thornDef, THORN_PROJECTILE_TYPE } from './thornDef';
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
    [ARC_BOLT_PROJECTILE_TYPE]: arcBoltDef,
    [DARK_SHARD_PROJECTILE_TYPE]: darkShardDef,
    [BURROWING_PROJECTILE_TYPE]: burrowingDef,
    [THORN_PROJECTILE_TYPE]: thornDef,
    [DEPLOYABLE_DELIVERY_PROJECTILE_TYPE]: foldedDeployableDef,
    [LEGACY_TURRET_DELIVERY_PROJECTILE_TYPE]: foldedDeployableDef,
};

export function getProjectileDef(type: string): IProjectileDef {
    return registry[type] ?? defaultProjectileDef;
}

export type { IProjectileDef, SpriteProjectileConfig, DirectionBlobDef, SpriteFramesDef, TrailDef, AnimationDef } from './types';
