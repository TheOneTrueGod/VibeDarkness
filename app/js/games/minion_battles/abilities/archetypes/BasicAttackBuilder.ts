/**
 * BasicAttackBuilder — factory for the standard "wait → slide-in → hit → slide-out" melee attack.
 *
 * Wraps defineMeleeStrike with opinionated defaults for basic bite/scratch attacks:
 * 30px range, 20px thickness, 8px forward slide, 0.1s active window, shrinking-circle telegraph.
 * The produced ability carries the 'free' tag so it is never consumed.
 *
 * `strike` picks how the hit is delivered: the default melee lunge above, or `dashThrough` — the caster
 * dashes straight through the target leaving a slash trail (`defineDashStrikeAttack`; Dog Bite, 0701).
 */

import type { AbilityStatic, AbilityNinjutsuConfig } from '../Ability';
import type { CardDef } from '../../card_defs/types';
import { defineMeleeStrike } from './defineMeleeStrike';
import { defineDashStrikeAttack } from './defineDashStrikeAttack';
import type { SlashTrailColors } from '../../game/effects/slashTrail';
import { BASIC_ATTACK_LOCK_ON_EXTRA, BASIC_ATTACK_MAX_LOCK_ON_EXTRA } from '../targetLockTracking';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** How a basic attack delivers its hit. */
export type BasicAttackStrike =
    /** Stand, slide in a few px and hit a short line in front (the default). */
    | { kind: 'meleeLunge' }
    /** Dash straight through the target, leaving a slash trail; it takes damage as the caster passes. */
    | {
          kind: 'dashThrough';
          trail?: SlashTrailColors;
          /** Seconds of the dash (default 0.12). */
          dashDuration?: number;
          /** How far past the target's edge (px) the dash starts and ends. */
          overshootPx?: number;
      };

export interface BasicAttackConfig {
    id: string;
    name: string;
    /** Tooltip text. Prefer `{{DAMAGE}}` for research-aware damage; `{N}` matching `damage` is rewritten. */
    description: string;
    damage: number;
    /** SVG string for the card icon. Defaults to empty string (no icon). */
    image?: string;
    /** Windup phase duration in seconds. Default 1.0. */
    windupDuration?: number;
    /** Cooldown phase duration in seconds. Default 1.1. */
    cooldownDuration?: number;
    /** Override the AI engagement range (px). Default: derived from hitbox (30 + 20 = 50). */
    aiMaxRange?: number;
    /** AI priority weight. Default 0. Use negative values to deprioritise (e.g. -10 for fallbacks). */
    aiPriority?: number;
    /** Colour of the windup telegraph. Default 0xff8800 (orange). */
    telegraphColor?: number;
    /** Telegraph animation style. Default 'shrinkingCircle'. */
    telegraphKind?: 'shrinkingCircle' | 'growingLine';
    /**
     * `abilityTimings` interval id after which windup target-tracking (e.g. the telegraph aim)
     * freezes instead of continuing until `prefireTime`. See `AbilityStatic.trackTargetUntilLabel`.
     */
    trackTargetUntilLabel?: string;
    /** Ninjutsu pool config. Use `{ ignore: true }` for boss abilities that bypass the pool. */
    aiNinjutsu?: AbilityNinjutsuConfig;
    /** How the hit lands. Default `{ kind: 'meleeLunge' }`. Telegraph options apply to the lunge only. */
    strike?: BasicAttackStrike;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BasicAttackResult {
    ability: AbilityStatic;
    card: CardDef;
}

class BasicAttackBuilderInstance {
    constructor(private readonly config: BasicAttackConfig) {}

    build(): BasicAttackResult {
        const base = this.buildBase();
        const ability: AbilityStatic = {
            ...base,
            tags: [...(base.tags ?? []), 'free', 'basicAttack'],
        };
        return { ability, card: { abilityId: this.config.id } };
    }

    private buildBase(): AbilityStatic {
        const { config } = this;
        const getTooltipText = () => [
            config.description.includes('{{DAMAGE}}')
                ? config.description
                : config.description.split(`{${config.damage}}`).join('{{DAMAGE}}'),
        ];
        if (config.strike?.kind === 'dashThrough') {
            return defineDashStrikeAttack({
                id: config.id,
                name: config.name,
                image: config.image ?? '',
                damage: config.damage,
                trail: config.strike.trail,
                dashDuration: config.strike.dashDuration,
                overshootPx: config.strike.overshootPx,
                windupDuration: config.windupDuration ?? 0,
                cooldownDuration: config.cooldownDuration ?? 1.1,
                aiMaxRange: config.aiMaxRange,
                aiPriority: config.aiPriority ?? 0,
                aiNinjutsu: config.aiNinjutsu,
                getTooltipText,
            });
        }
        return defineMeleeStrike({
            id: config.id,
            melee: false,
            name: config.name,
            image: config.image ?? '',
            resourceCost: null,
            rechargeTurns: 0,
            recoveries: [],
            damage: config.damage,
            range: 30,
            thickness: 20,
            forwardDistance: 8,
            backwardDistance: 0,
            impactType: 'punch',
            activeDuration: 0.1,
            windupDuration: config.windupDuration ?? 1.0,
            cooldownDuration: config.cooldownDuration ?? 1.1,
            aiPriority: config.aiPriority ?? 0,
            aiMaxRange: config.aiMaxRange,
            aiNinjutsu: config.aiNinjutsu,
            lockOnExtra: BASIC_ATTACK_LOCK_ON_EXTRA,
            maxLockOnExtra: BASIC_ATTACK_MAX_LOCK_ON_EXTRA,
            telegraph: config.telegraphKind === 'growingLine'
                ? { kind: 'growingLine', color: config.telegraphColor ?? 0xff8800, alpha: 0.3 }
                : { kind: 'shrinkingCircle', startRadius: 18, color: config.telegraphColor ?? 0xff8800, alpha: 0.3 },
            trackTargetUntilLabel: config.trackTargetUntilLabel,
            getTooltipText,
        });
    }
}

export function BasicAttackBuilder(config: BasicAttackConfig): BasicAttackBuilderInstance {
    return new BasicAttackBuilderInstance(config);
}
