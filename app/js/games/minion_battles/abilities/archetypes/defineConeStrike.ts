/**
 * defineConeStrike — archetype factory for a short windup, then one cone burst from the caster.
 *
 * Every enemy in the cone (closest first, up to `maxTargets`) takes damage and is stunned and
 * interrupted. A `ConeFlash` fades out over the cone. Cone of Light (0121) and Release Charge
 * (1009) are both this shape with different numbers and colours.
 *
 * Colours: omitted ones take the ability's two-tone theme (flash = secondary, preview fill = primary,
 * preview stroke = secondary). Without one, the flash keeps the effect's teal and the preview is grey.
 */

import type { AbilityRecoveryRule, AbilityStatic, IAbilityPreviewGraphics } from '../Ability';
import { AbilityEventType } from '../Ability';
import { AbilityPhase } from '../abilityTimings';
import { CastBehaviours } from '../CastBehaviours';
import { HitboxSpec } from '../../hitboxes/HitboxSpec';
import type { HitboxEngineContext, HitboxPreviewCaster } from '../../hitboxes';
import type { Unit } from '../../game/units/Unit';
import { Effect } from '../../game/effects/Effect';
import { getDirectionFromTo, pointInCone } from '../targetHelpers';
import { areEnemies } from '../../game/teams';
import { drawConeSlice } from '../previewHelpers';
import { getTwoToneAbilityTheme } from '../../themes/abilityTheme';

export interface ConeStrikeConfig {
    id: string;
    name: string;
    image: string;
    resourceCost?: AbilityStatic['resourceCost'];
    rechargeTurns?: number;
    maxUses?: number;
    startingUses?: number;
    recoveries?: readonly AbilityRecoveryRule[];

    range: number;
    halfAngleRad: number;
    damage: number;
    maxTargets: number;
    stunSeconds: number;
    stunCcCharges: number;

    windupEnd: number;
    activeEnd: number;
    cooldownEnd: number;
    /** Label of the aim pick (default: 'Direction'). */
    aimLabel?: string;

    flashDuration: number;
    /** `ConeFlash` fill. Omitted: the theme secondary for a two-tone theme, else the effect's default teal. */
    flashColor?: number;
    /** Omitted: the theme primary for a two-tone theme, else {@link DEFAULT_CONE_PREVIEW_FILL_COLOR}. */
    previewFillColor?: number;
    /** Omitted: the theme secondary for a two-tone theme, else {@link DEFAULT_CONE_PREVIEW_STROKE_COLOR}. */
    previewStrokeColor?: number;

    getTooltipText: (gameState?: unknown) => string[];
    /** Card flavour line; see `AbilityStatic.flavorText`. */
    flavorText?: string;
}

/** Cone from the caster toward the aim point. Hits enemies only, closest first. */
export class ConeStrikeHitboxSpec extends HitboxSpec {
    constructor(
        private readonly range: number,
        private readonly halfAngleRad: number,
        private readonly maxTargets: number,
        private readonly previewFillColor: number,
        private readonly previewStrokeColor: number,
    ) {
        super();
    }

    get maxRange(): number { return this.range; }
    override get numTargets(): number { return this.maxTargets; }

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const centerAngle = Math.atan2(dy, dx);
        const dirX = dx / dist;
        const dirY = dy / dist;
        gr.clear();
        drawConeSlice(gr, caster.x, caster.y, centerAngle, this.halfAngleRad, 0, this.range, {
            fillColor: this.previewFillColor,
            fillAlpha: 0.2,
            strokeColor: this.previewStrokeColor,
            strokeAlpha: 0.7,
        });
        return units.filter(
            (u) => u.isAlive() &&
                pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, this.range, this.halfAngleRad),
        );
    }

    resolveTargets(caster: Unit, aimPoint: { x: number; y: number }, units: Unit[]): Unit[] {
        const dx = aimPoint.x - caster.x;
        const dy = aimPoint.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const dirX = dx / dist;
        const dirY = dy / dist;
        return units.filter(
            (u) => u.id !== caster.id && u.isAlive() &&
                pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, this.range, this.halfAngleRad),
        );
    }

    resolveHits(engine: HitboxEngineContext, caster: Unit, aimX: number, aimY: number): Unit[] {
        const dx = aimX - caster.x;
        const dy = aimY - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return [];
        const dirX = dx / dist;
        const dirY = dy / dist;
        const hits: Unit[] = [];
        for (const u of engine.units) {
            if (u.id === caster.id || !u.isAlive()) continue;
            if (!areEnemies(caster.teamId, u.teamId)) continue;
            if (pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, this.range, this.halfAngleRad)) {
                hits.push(u);
            }
        }
        hits.sort((a, b) =>
            Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y),
        );
        return hits;
    }
}

const DEFAULT_AIM_LABEL = 'Direction';

/** Neutral aim-preview grey used when neither the caller nor a two-tone theme gives a colour. */
export const DEFAULT_CONE_PREVIEW_FILL_COLOR = 0xa0a0a0;
export const DEFAULT_CONE_PREVIEW_STROKE_COLOR = 0x505050;

/**
 * Colours the cone strike will use. Explicit config colours win; omitted ones come from the ability's
 * two-tone theme, then the archetype defaults. `flashColor` undefined means the `ConeFlash` default.
 */
export function resolveConeStrikeColors(
    config: Pick<ConeStrikeConfig, 'id' | 'flashColor' | 'previewFillColor' | 'previewStrokeColor'>,
): { flashColor: number | undefined; previewFillColor: number; previewStrokeColor: number } {
    const theme = getTwoToneAbilityTheme(config.id);
    return {
        flashColor: config.flashColor ?? theme?.secondaryNum,
        previewFillColor: config.previewFillColor ?? theme?.primaryNum ?? DEFAULT_CONE_PREVIEW_FILL_COLOR,
        previewStrokeColor: config.previewStrokeColor ?? theme?.secondaryNum ?? DEFAULT_CONE_PREVIEW_STROKE_COLOR,
    };
}

export function defineConeStrike(config: ConeStrikeConfig): AbilityStatic {
    const colors = resolveConeStrikeColors(config);
    const hitbox = new ConeStrikeHitboxSpec(
        config.range,
        config.halfAngleRad,
        config.maxTargets,
        colors.previewFillColor,
        colors.previewStrokeColor,
    );

    return {
        id: config.id,
        name: config.name,
        image: config.image,
        resourceCost: config.resourceCost ?? null,
        rechargeTurns: config.rechargeTurns ?? 0,
        maxUses: config.maxUses,
        ...(config.startingUses !== undefined ? { startingUses: config.startingUses } : {}),
        recoveries: config.recoveries,
        prefireTime: config.windupEnd,
        abilityTimings: [
            { id: 'windup', start: 0, end: config.windupEnd, abilityPhase: AbilityPhase.Windup },
            {
                id: 'active',
                start: config.windupEnd,
                end: config.activeEnd,
                abilityPhase: AbilityPhase.Active,
                doNotRefund: true,
                targetDef: {
                    kind: 'select',
                    label: config.aimLabel ?? DEFAULT_AIM_LABEL,
                    hitbox,
                    filter: 'enemy',
                    allowMiss: true,
                    lockOnMode: 'strictHitbox',
                },
                behaviour: CastBehaviours.MeleeAttack()
                    .withHitbox(hitbox)
                    .withLockOnMode('strictHitbox')
                    .withDamage(config.damage)
                    .withImpactVFX((ctx, _hitUnits, aimX, aimY) => {
                        const { dirX, dirY } = getDirectionFromTo(ctx.caster.x, ctx.caster.y, aimX, aimY);
                        ctx.engine.addEffect(new Effect({
                            x: ctx.caster.x,
                            y: ctx.caster.y,
                            duration: config.flashDuration,
                            effectType: 'ConeFlash',
                            effectData: {
                                centerAngle: Math.atan2(dirY, dirX),
                                halfArcRad: config.halfAngleRad,
                                innerR: 0,
                                outerR: config.range,
                                ...(colors.flashColor !== undefined ? { color: colors.flashColor } : {}),
                            },
                        }));
                    }),
            },
            { id: 'cooldown', start: config.activeEnd, end: config.cooldownEnd, abilityPhase: AbilityPhase.Cooldown },
        ],
        targets: [],
        aiSettings: { minRange: 0, maxRange: config.range },

        abilityEvents: {
            [AbilityEventType.ON_ATTACK_HIT]: [
                {
                    conditions: [{ type: 'hitResultIs', result: 'hit' }],
                    effects: [
                        { type: 'applyStunnedToPrimaryTarget', duration: config.stunSeconds, ccCharges: config.stunCcCharges },
                        { type: 'interruptPrimaryTargetAbilities' },
                    ],
                },
            ],
        },

        getTooltipText: config.getTooltipText,
        flavorText: config.flavorText,

        getAbilityStates(): [] {
            return [];
        },
    };
}
