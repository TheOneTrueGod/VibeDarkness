/**
 * Thorn Stomp — Thornbinder's panic response when something gets in close. After a one-second
 * wind-up it slams the ground beneath itself, knocking back and damaging anything nearby before
 * leaving a jittered patch of slowing thorns, mirroring Bramble's payoff but centered on its own
 * feet. It is purely reactive: the AI never approaches to use it, only firing when a threat has
 * already closed inside half the stomp's blast radius despite the unit's usual kiting.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { Effect } from '../../game/effects/Effect';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import type { KnockbackSource } from '../../game/units/unitTypes';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { damageEnemiesInCircle, placeJitteredGroundThorns } from '../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import type { EventBus } from '../../game/EventBus';
import { isLightHateWeakened } from '../../game/lightHate';
import type { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { ROUND_DURATION } from '../../game/gameConstants';

export const THORN_STOMP_ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}16`;

const MAX_USES = 1;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const WINDUP_TIME = 1;
// One-tick "active" linger so the timeline ring reads red at the payoff instant.
const STRIKE_TIME = WINDUP_TIME + 1 / 60;
// Almost no cooldown — the AI's reactive gate (aiSettings below) and the 1-use/round recovery
// are what actually pace this ability, not the cast's own cooldown tail.
const COOLDOWN_END = STRIKE_TIME + 0.1;
const BASE_RADIUS = 95;
const WEAKENED_RADIUS = 72;
const BASE_DAMAGE = 7;
const WEAKENED_DAMAGE = 5;
const SLOW_MULT_NORMAL = 0.52;
const SLOW_MULT_WEAKENED = 0.72;
const THORN_CLEAR_BEFORE_NEXT_SEC = 0.15;
const DURATION_JITTER_IN_SECONDS = 1;
const KNOCKBACK_TIER = 2;
// Only a valid AI choice once a threat is inside half the stomp's own blast radius.
const AI_TRIGGER_RANGE = BASE_RADIUS * 0.5;

interface EngineLike {
    units: Unit[];
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    terrainLayers: TerrainLayerManager;
    lightLevelEnabled: boolean;
    globalLightLevel: number;
    terrainManager: { grid: import('../../terrain/TerrainGrid').TerrainGrid } | null;
    addEffect(effect: Effect): void;
    getAllLightSources(): import('../../game/LightGrid').LightSource[];
    generateRandomInteger(min: number, max: number): number;
}

export const ThornStompAbility: AbilityStatic = {
    id: THORN_STOMP_ABILITY_ID,
    name: 'Thorn Stomp',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
    prefireTime: WINDUP_TIME,
    abilityTimings: [
        { id: 'windup', start: 0, end: WINDUP_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'strike', start: WINDUP_TIME, end: STRIKE_TIME, abilityPhase: AbilityPhase.Active, doNotRefund: true },
        { id: 'cooldown', start: STRIKE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    aiSettings: {
        minRange: 0,
        maxRange: AI_TRIGGER_RANGE,
        // Wins the priority tie-break over Bramble (priority 0) whenever both are valid.
        priority: 1,
        // React to any nearby threat, not just the unit's locked hunt target.
        candidateScope: 'anyNearby',
        // This is a self-cast (targets: []); without this the AI would treat it as always valid.
        enforceRangeWhenUntargeted: true,
        // Defensive ability — don't compete with offensive casts for the shared attack budget.
        ninjutsu: { ignore: true },
    },

    getTooltipText(): string[] {
        return [
            `Slam the ground beneath itself, dealing damage, {knockback ${KNOCKBACK_TIER}}, and leaving bramble that slows movement`,
            'Weakened by bright light (Light Hate)',
            'Only triggers when a foe gets too close',
        ];
    },
    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, _targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= WINDUP_TIME || currentTime < WINDUP_TIME) return;
        const eng = engine as EngineLike;

        const weakened = isLightHateWeakened(caster, eng);
        const radius = weakened ? WEAKENED_RADIUS : BASE_RADIUS;
        const damage = weakened ? WEAKENED_DAMAGE : BASE_DAMAGE;
        const slowMult = weakened ? SLOW_MULT_WEAKENED : SLOW_MULT_NORMAL;
        const center = { x: caster.x, y: caster.y };

        const knockbackCtx = knockbackCtxFromEngine(eng);
        const knockbackSource: KnockbackSource = { unitId: caster.id, abilityId: THORN_STOMP_ABILITY_ID };
        damageEnemiesInCircle({
            engine: eng,
            caster,
            center,
            radius,
            damage,
            abilityId: THORN_STOMP_ABILITY_ID,
            attackType: 'melee',
            onHit: (unit) => {
                tryDamageOrBlock(unit, {
                    engine: eng,
                    gameTime: eng.gameTime,
                    eventBus: eng.eventBus,
                    attackerX: center.x,
                    attackerY: center.y,
                    attackerId: caster.id,
                    abilityId: THORN_STOMP_ABILITY_ID,
                    damage,
                    attackType: 'melee',
                });
                // Away from caster's own position — this is a self-centered stomp, so "away from
                // source" already means "radially outward" with no aim/landing math needed.
                tryApplyKnockbackByTier(unit, KNOCKBACK_TIER, knockbackSource, center.x, center.y, knockbackCtx);
            },
        });

        // Thorns last close to a full round, same reasoning as Bramble: with only 1 use/round
        // recovered, the next stomp is realistically ~a round away, not gated by this cast's own
        // (near-zero) cooldown tail.
        const baseExpiresAt = eng.gameTime + ROUND_DURATION - THORN_CLEAR_BEFORE_NEXT_SEC;
        placeJitteredGroundThorns({
            engine: eng,
            caster,
            center,
            radius,
            effectType: 'dark_thorn',
            placedAtGameTime: eng.gameTime,
            baseExpiresAtGameTime: baseExpiresAt,
            durationJitterInSeconds: DURATION_JITTER_IN_SECONDS,
            ownerAbilityId: THORN_STOMP_ABILITY_ID,
            params: { slowMult },
            idPrefix: `thornstomp-${caster.id}-${eng.gameTime}`,
        });

        eng.addEffect(new Effect({
            x: center.x,
            y: center.y,
            duration: 0.6,
            effectType: 'BrambleExplosion',
            effectRadius: radius,
        }));
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: ActiveAbility,
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed >= WINDUP_TIME) return;

        // Outer boundary circle: shows full impact radius, brightens as impact nears
        const borderAlpha = 0.25 + 0.55 * Math.min(1, elapsed / WINDUP_TIME);
        gr.circle(caster.x, caster.y, BASE_RADIUS);
        gr.stroke({ color: 0xef4444, width: 2, alpha: borderAlpha });

        // Expanding inner ring: grows from 0 to BASE_RADIUS over the full wind-up
        const ringT = elapsed / WINDUP_TIME;
        const ringRadius = ringT * BASE_RADIUS;
        if (ringRadius > 2) {
            gr.circle(caster.x, caster.y, ringRadius);
            gr.stroke({ color: 0xfca5a5, width: 3, alpha: 0.45 + 0.45 * ringT });
        }
    },
};

export const ThornStompCard: CardDef = {
    abilityId: THORN_STOMP_ABILITY_ID,
};
