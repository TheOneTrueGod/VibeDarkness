import type { HitboxSpec } from '../hitboxes/HitboxSpec';

/** Player clicks to select a target via this hitbox. */
export interface SelectTargetDef {
    kind: 'select';
    label: string;
    hitbox: HitboxSpec;
    filter: 'enemy' | 'ally' | 'any';
    allowMiss?: boolean;
}

/** Reuse a target that was committed by an earlier SelectTargetDef timing. */
export interface HitTargetDef {
    kind: 'hit';
    labels: string[];
}

export type TimingTargetDef = SelectTargetDef | HitTargetDef;

export function isSelectTargetDef(d: TimingTargetDef): d is SelectTargetDef { return d.kind === 'select'; }
export function isHitTargetDef(d: TimingTargetDef): d is HitTargetDef    { return d.kind === 'hit'; }
