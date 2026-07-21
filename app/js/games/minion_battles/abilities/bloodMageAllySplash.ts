/**
 * Shared ally-target splash used by Blood Mend (0301) and Protect (0303): a circular AoE
 * centered on the selected ally that damages nearby enemies when the cast becomes active.
 * Preview geometry lives on the hitbox so hover targeting and hit resolution stay aligned.
 * See `card_defs/03_blood_mage/AGENTS.md`.
 */

import type { IAbilityPreviewGraphics } from './Ability';
import { damageEnemiesInCircle } from './targetHelpers';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import type { HitboxPreviewCaster } from '../hitboxes';
import { UnitRangeHitboxSpec } from '../hitboxes/UnitRangeHitboxSpec';

/** Splash circle radius around the targeted ally (px). */
export const BLOOD_MAGE_ALLY_SPLASH_RADIUS = 70;
export const BLOOD_MAGE_ALLY_SPLASH_DAMAGE = 2;
export const BLOOD_MAGE_ALLY_SPLASH_MAX_TARGETS = 4;

const PREVIEW_FILL_COLOR = 0x8b1220;
const PREVIEW_STROKE_COLOR = 0xfca5a5;

function drawAllySplashPreview(
    gr: IAbilityPreviewGraphics,
    x: number,
    y: number,
    radius: number,
): void {
    gr.circle(x, y, radius);
    gr.fill({ color: PREVIEW_FILL_COLOR, alpha: 0.18 });
    gr.circle(x, y, radius);
    gr.stroke({ color: PREVIEW_STROKE_COLOR, width: 2, alpha: 0.7 });
}

/**
 * Unit-pick hitbox that also draws the ally splash circle around the hovered candidate.
 */
export class UnitRangeWithAllySplashHitboxSpec extends UnitRangeHitboxSpec {
    readonly splashRadius: number;

    constructor(
        maxRange: number,
        splashRadius: number,
        minRange = 0,
        includeCaster = false,
    ) {
        super(maxRange, minRange, includeCaster);
        this.splashRadius = splashRadius;
    }

    override renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: HitboxPreviewCaster,
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): Unit[] {
        const candidates = super.renderTargetingPreview(gr, caster, mouseWorld, units);
        const primary = candidates[0];
        if (primary) {
            drawAllySplashPreview(gr, primary.x, primary.y, this.splashRadius);
        }
        return candidates;
    }
}

/** Ally-select hitbox with hover splash preview (includeCaster for self-castable ally steps). */
export function unitRangeWithAllySplashHitbox(
    maxRange: number,
    splashRadius: number = BLOOD_MAGE_ALLY_SPLASH_RADIUS,
    includeCaster = true,
): UnitRangeWithAllySplashHitboxSpec {
    return new UnitRangeWithAllySplashHitboxSpec(maxRange, splashRadius, 0, includeCaster);
}

/** Deal splash damage to the closest enemies in the circle around `center`. */
export function dealBloodMageAllySplash(
    engine: EngineContext,
    caster: Unit,
    center: { x: number; y: number },
    abilityId: string,
): void {
    damageEnemiesInCircle({
        engine,
        caster,
        center,
        radius: BLOOD_MAGE_ALLY_SPLASH_RADIUS,
        damage: BLOOD_MAGE_ALLY_SPLASH_DAMAGE,
        abilityId,
        attackType: 'ranged',
        maxTargets: BLOOD_MAGE_ALLY_SPLASH_MAX_TARGETS,
    });
}
