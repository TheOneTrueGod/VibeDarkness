/**
 * BasicAttackBuilder — factory for the standard "wait → slide-in → hit → slide-out" melee attack.
 *
 * Wraps defineMeleeStrike with opinionated defaults for basic bite/scratch attacks:
 * 30px range, 20px thickness, 8px forward slide, 0.1s active window, shrinking-circle telegraph.
 * The produced ability carries the 'free' tag so it is never consumed.
 */

import type { AbilityStatic, AbilityNinjutsuConfig } from '../Ability';
import type { CardDef } from '../../card_defs/types';
import { defineMeleeStrike } from './defineMeleeStrike';
import { BASIC_ATTACK_LOCK_ON_EXTRA, BASIC_ATTACK_MAX_LOCK_ON_EXTRA } from '../targetLockTracking';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

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
        const { config } = this;
        const base = defineMeleeStrike({
            id: config.id,
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
            getTooltipText: () => [
                config.description.includes('{{DAMAGE}}')
                    ? config.description
                    : config.description.split(`{${config.damage}}`).join('{{DAMAGE}}'),
            ],
        });

        const ability: AbilityStatic = {
            ...base,
            tags: [...(base.tags ?? []), 'free'],
        };

        return { ability, card: { abilityId: config.id } };
    }
}

export function BasicAttackBuilder(config: BasicAttackConfig): BasicAttackBuilderInstance {
    return new BasicAttackBuilderInstance(config);
}
