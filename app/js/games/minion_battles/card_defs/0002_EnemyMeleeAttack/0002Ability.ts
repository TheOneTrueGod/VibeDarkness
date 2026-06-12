/**
 * EnemyMeleeAttack - Enemy melee ability. Wind-up 0.5s, hits at end of active window
 * with a melee-line strike. AI maxRange 75 px.
 */

import { defineMeleeStrike } from '../../abilities/archetypes/defineMeleeStrike';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { drawEnemyConeHitboxTelegraph } from '../../abilities/previewHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}02`;
const LOCK_TIME = 0.5;
const PREFIRE_TIME = 1.0;
/** Brief time after hit to keep drawing the cone flash. */
const FLASH_DURATION = 0.15;
/** Pixels beyond min range for the cone / line hitbox. */
const MAX_RANGE = 50;
const DAMAGE = 6;
const CONE_HALF_ANGLE_DEG = 45;
const RED = 0xff0000;
/** Caster min radius offset (same as original getMinRadius). */
const MIN_RADIUS_OFFSET = 5;
/** Default unit radius — used for AI maxRange calculation. */
const UNIT_RADIUS = 20;

const ENEMY_MELEE_ATTACK_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L32 56 M28 12 L36 12 M28 52 L36 52" stroke="#5d4e37" stroke-width="2" fill="none"/>
  <rect x="28" y="24" width="8" height="24" rx="2" fill="#654321"/>
  <circle cx="32" cy="32" r="6" fill="#2d2d2d"/>
</svg>`;

function getTargetPosition(caster: Unit, active: { targets: ResolvedTarget[] }): { x: number; y: number } | null {
    if (isAbilityNote(caster.abilityNote, '0002')) {
        return caster.abilityNote.abilityNote.position;
    }
    return getPixelTargetPosition(active.targets, 0);
}

const _base = defineMeleeStrike({
    id: CARD_ID,
    name: 'Enemy Melee Attack',
    image: ENEMY_MELEE_ATTACK_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    damage: DAMAGE,
    // Plain melee-line strike: range=MAX_RANGE from the edge of the caster's radius.
    range: MAX_RANGE,
    thickness: 20,
    impactType: 'punch',
    impactAt: 1.0,
    forwardDistance: 8,
    backwardDistance: 0,
    windupDuration: LOCK_TIME,
    activeDuration: PREFIRE_TIME - LOCK_TIME,
    cooldownDuration: 2.5,
    movementLockUntil: PREFIRE_TIME,
    // AI maxRange mirrors original: UNIT_RADIUS + MIN_RADIUS_OFFSET + MAX_RANGE.
    aiMaxRange: UNIT_RADIUS + MIN_RADIUS_OFFSET + MAX_RANGE,
    targets: [{ type: 'pixel', label: 'Target location' }],

    getTooltipText(): string[] {
        return [`Strike in a cone dealing {${DAMAGE}} damage to enemies`];
    },
});

export const EnemyMeleeAttackAbility = {
    ..._base,

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        const target = getTargetPosition(caster, activeAbility);
        if (!target) return;

        const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
        const angle = Math.atan2(dirY, dirX);
        const halfRad = (CONE_HALF_ANGLE_DEG * Math.PI) / 180;
        const minR = caster.radius + MIN_RADIUS_OFFSET;
        const maxR = minR + MAX_RANGE;
        const flash = elapsed >= PREFIRE_TIME && elapsed < PREFIRE_TIME + FLASH_DURATION;
        drawEnemyConeHitboxTelegraph(gr, caster.x, caster.y, angle, halfRad, minR, maxR, elapsed, PREFIRE_TIME, {
            color: RED,
            holdFullRedUntilOffset: FLASH_DURATION,
            flashFillBoost: flash ? 0.35 : 0,
        });
    },
};

export const EnemyMeleeAttackCard: CardDef = {
    abilityId: CARD_ID,
};
