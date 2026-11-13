/**
 * Dropped-weapon cost: an ability that is paid for with the caster's own dropped weapons instead of a
 * resource. It needs `count` of them within `radius` of the caster, and destroys the closest `count`
 * when it resolves. Any kind of dropped weapon counts, the same as Echo (`abilities/echo/echo.ts`).
 *
 * The pick check ({@link droppedWeaponCostValidator}), the preview ({@link drawDroppedWeaponCostPreview})
 * and the payment ({@link payDroppedWeaponCost}) all read {@link findCostWeapons}, so they agree.
 */
import type { IAbilityPreviewGraphics } from '../Ability';
import type { Deployable, DeployableQuery } from '../../game/deployables/Deployable';
import type { Unit } from '../../game/units/Unit';
import { INVALID_PICK_CROSS_HALF_SIZE } from '../../hitboxes/invalidPickPreview';

/** Reach ring and scrap label when the caster is short of dropped weapons. */
export const DROPPED_WEAPON_SHORT_COLOR = 0xef4444;
/** Player-facing name for a dropped weapon spent on a deployable. */
export const SCRAP_WORD = 'scrap';
/** Gap between the bottom of the invalid-pick cross and the scrap label, in px. */
export const SCRAP_LABEL_GAP_PX = 4;

export interface DroppedWeaponCost {
    /** Weapons needed, and destroyed. */
    count: number;
    /** Reach from the caster, in pixels. */
    radius: number;
}

interface CostEngine {
    findDeployables?(query: DeployableQuery): Deployable[];
    consumeDeployable?(deployable: Pick<Deployable, 'id' | 'kind'>): boolean;
}

/** The caster's closest dropped weapons within reach, at most `cost.count`, nearest first. */
export function findCostWeapons(engine: unknown, caster: Unit, cost: DroppedWeaponCost): Deployable[] {
    const eng = engine as CostEngine | undefined;
    if (!eng?.findDeployables) return [];
    return eng
        .findDeployables({
            castingTeam: caster.teamId,
            near: { x: caster.x, y: caster.y },
            radius: cost.radius,
            tags: ['droppedWeapon'],
            ownerUnitId: caster.id,
        })
        .slice(0, cost.count);
}

export function canPayDroppedWeaponCost(engine: unknown, caster: Unit, cost: DroppedWeaponCost): boolean {
    return findCostWeapons(engine, caster, cost).length >= cost.count;
}

/** `2/4 scrap` while short. Null once the caster can pay, so the label stays hidden. */
export function scrapShortfallLabel(engine: unknown, caster: Unit, cost: DroppedWeaponCost): string | null {
    const have = findCostWeapons(engine, caster, cost).length;
    if (have >= cost.count) return null;
    return `${have}/${cost.count} ${SCRAP_WORD}`;
}

/** Red scrap count centred under the invalid-pick cross. No-op when the cost can be paid. */
export function drawScrapShortfallLabel(
    gr: IAbilityPreviewGraphics,
    engine: unknown,
    caster: Unit,
    cost: DroppedWeaponCost,
    aim: { x: number; y: number },
): void {
    const label = scrapShortfallLabel(engine, caster, cost);
    if (!label) return;
    gr.label?.(
        label,
        aim.x,
        aim.y + INVALID_PICK_CROSS_HALF_SIZE + SCRAP_LABEL_GAP_PX,
        DROPPED_WEAPON_SHORT_COLOR,
    );
}

/** Destroy the weapons. Returns false, and destroys nothing, when there are too few. */
export function payDroppedWeaponCost(engine: unknown, caster: Unit, cost: DroppedWeaponCost): boolean {
    const weapons = findCostWeapons(engine, caster, cost);
    if (weapons.length < cost.count) return false;
    const eng = engine as CostEngine;
    for (const weapon of weapons) eng.consumeDeployable?.(weapon);
    return true;
}

/** Wraps a pick validator so the pick is also rejected while the caster is short of weapons. */
export function droppedWeaponCostValidator<Ctx extends { caster: Unit; engine: unknown }>(
    cost: DroppedWeaponCost,
    validate: (ctx: Ctx) => boolean,
): (ctx: Ctx) => boolean {
    return (ctx) => canPayDroppedWeaponCost(ctx.engine, ctx.caster, cost) && validate(ctx);
}

export interface DroppedWeaponCostPreviewStyle {
    /** Colour when the cost can be paid. */
    color: number;
    /** Colour when too few weapons are in reach. */
    shortColor: number;
    /** Radius of the ring drawn around each weapon that will be destroyed. */
    markRadius: number;
}

/**
 * Targeting preview: the reach ring around the caster, and a ring on each weapon that would be destroyed.
 * The reach ring turns `shortColor` while the caster is short of weapons.
 */
export function drawDroppedWeaponCostPreview(
    gr: IAbilityPreviewGraphics,
    gameState: unknown,
    caster: Unit,
    cost: DroppedWeaponCost,
    style: DroppedWeaponCostPreviewStyle,
): void {
    const weapons = findCostWeapons(gameState, caster, cost);
    const color = weapons.length >= cost.count ? style.color : style.shortColor;
    gr.circle(caster.x, caster.y, cost.radius);
    gr.stroke({ color, width: 2, alpha: 0.6 });
    for (const weapon of weapons) {
        gr.circle(weapon.x, weapon.y, style.markRadius);
        gr.fill({ color, alpha: 0.2 });
        gr.circle(weapon.x, weapon.y, style.markRadius);
        gr.stroke({ color, width: 2, alpha: 0.9 });
    }
}
