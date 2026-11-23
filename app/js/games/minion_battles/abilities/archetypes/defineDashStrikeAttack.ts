/**
 * defineDashStrikeAttack — archetype for a single-target strike where the caster dashes straight through
 * its target, leaving a slash trail, and the target takes damage as the caster passes through it.
 *
 * The strike is one `CastBehaviours.DashStrike()` window (see `DashStrikeBehaviour`): a short blink to the
 * caster's side of the target, then a fast dash through it to the far side. Same strike as one hit of
 * Spirit Flurry (0711), packaged as a full ability with optional windup, cooldown and AI settings.
 *
 * Damage includes `abilityModifiers.damageFlat` (see `flatDamage.ts`) for the hit, `getDamage` and the
 * `{{DAMAGE}}` tooltip token.
 */
import type { AbilityStatic, AbilityTag, AbilityNinjutsuConfig } from '../Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import { CastBehaviours } from '../CastBehaviours';
import type { TargetDef } from '../targeting';
import { defineAbility } from '../defineAbility';
import type { SlashTrailColors } from '../../game/effects/slashTrail';
import { flatDamageFor, flatDamageGetDamage, flatDamageTooltip } from './flatDamage';

export interface DashStrikeAttackConfig {
    id: string;
    name: string;
    image: string;
    damage: number;
    /** Slash trail left along the dash. Omit for no trail. */
    trail?: SlashTrailColors;
    /** Seconds before the dash starts (default 0: the strike fires as the cast begins). */
    windupDuration?: number;
    /** Seconds of the blink-and-dash (default 0.12, the same as Spirit Strike). */
    dashDuration?: number;
    /** Seconds after the dash before the ability is free again (default 0.9). */
    cooldownDuration?: number;
    /** How far past the target's edge (px) the dash starts and ends. Default: DashStrike's default. */
    overshootPx?: number;
    attackType?: 'melee' | 'charging';
    tags?: readonly AbilityTag[];
    /** AI engagement range (px) and `getRange` max. Default 50. */
    aiMaxRange?: number;
    aiPriority?: number;
    aiNinjutsu?: AbilityNinjutsuConfig;
    getTooltipText: (gameState?: unknown) => string[];
}

/** Default reach (px): matches the punch-style basic attack it replaces (30 px line + 20 px thickness). */
const DEFAULT_MAX_RANGE = 50;
/** Default dash window (s): Spirit Strike's (0710) blink-and-dash. */
const DEFAULT_DASH_SECONDS = 0.12;

export function defineDashStrikeAttack(config: DashStrikeAttackConfig): AbilityStatic {
    const windupEnd = config.windupDuration ?? 0;
    const dashEnd = windupEnd + (config.dashDuration ?? DEFAULT_DASH_SECONDS);
    const totalDuration = dashEnd + (config.cooldownDuration ?? 0.9);
    const maxRange = config.aiMaxRange ?? DEFAULT_MAX_RANGE;

    let strike = CastBehaviours.DashStrike()
        .withDamage((ctx) => flatDamageFor(config.id, config.damage, ctx.caster))
        .withAttackType(config.attackType ?? 'melee');
    if (config.trail) strike = strike.withSlashTrail(config.trail);
    if (config.overshootPx !== undefined) strike = strike.withOvershoot(config.overshootPx);

    const timings: AbilityTimingInterval[] = [
        ...(windupEnd > 0
            ? [{ id: 'windup', start: 0, end: windupEnd, abilityPhase: AbilityPhase.Windup }]
            : []),
        {
            id: 'strike',
            start: windupEnd,
            end: dashEnd,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            castBehaviours: [{ timingStart: 'start', timingEnd: 'end', behaviour: strike }],
        },
        { id: 'cooldown', start: dashEnd, end: totalDuration, abilityPhase: AbilityPhase.Cooldown },
    ];

    return defineAbility({
        id: config.id,
        name: config.name,
        image: config.image,
        resourceCost: null,
        rechargeTurns: 0,
        recoveries: [],
        tags: config.tags,
        prefireTime: windupEnd,
        targets: [{ type: 'unit', label: 'Target' }] as TargetDef[],
        abilityTimings: timings,
        aiSettings: {
            minRange: 0,
            maxRange,
            priority: config.aiPriority,
            ...(config.aiNinjutsu ? { ninjutsu: config.aiNinjutsu } : {}),
        },
        // The dash moves the caster itself: hold it still (no walking) until the dash is done.
        movementLock: { until: dashEnd },
        getRange: () => ({ minRange: 0, maxRange }),
        getDamage: flatDamageGetDamage(config.id, config.damage),
        getTooltipText: flatDamageTooltip(config.id, config.damage, config.getTooltipText),
    });
}
