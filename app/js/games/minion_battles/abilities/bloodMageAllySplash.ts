/**
 * Shared ally-target splash used by Blood Mend (0301) and Protect (0303): when the cast becomes
 * active they Rend around the selected ally (keyword `rend`: damage to nearby bleeding enemies).
 * Preview geometry lives on the hitbox so hover targeting and hit resolution stay aligned.
 * See `card_defs/03_blood_mage/AGENTS.md`.
 */

import type { IAbilityPreviewGraphics } from './Ability';
import { applyRend, REND_RADIUS } from './keywords/rendKeyword';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import type { HitboxPreviewCaster } from '../hitboxes';
import { UnitRangeHitboxSpec } from '../hitboxes/UnitRangeHitboxSpec';

/** Rend circle radius around the targeted ally (px); drawn while hovering an ally. */
export const BLOOD_MAGE_ALLY_SPLASH_RADIUS = REND_RADIUS;
/** Rend N applied around the targeted ally by Blood Mend and Protect. */
export const BLOOD_MAGE_REND = 2;

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

/** Rend around the targeted ally (`center`). */
export function dealBloodMageRend(
    engine: EngineContext,
    caster: Unit,
    center: { x: number; y: number },
    abilityId: string,
): void {
    applyRend(engine, caster, center, BLOOD_MAGE_REND, abilityId);
}
