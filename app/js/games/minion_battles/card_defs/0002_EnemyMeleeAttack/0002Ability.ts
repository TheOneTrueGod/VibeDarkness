/**
 * EnemyMeleeAttack - Enemy melee ability. Wind-up 0.5s (no move penalty), locks target at 0.5s, hits at 1s with a cone.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { areEnemies } from '../../game/teams';
import { DEFAULT_UNIT_RADIUS } from '../../game/units/unit_defs/unitConstants';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getDirectionFromTo, pointInCone } from '../../abilities/targetHelpers';
import { drawConeSlice } from '../../abilities/previewHelpers';
import type { EventBus } from '../../game/EventBus';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}02`;
const LOCK_TIME = 0.5;
const PREFIRE_TIME = 1.0;
/** Brief time after hit to keep drawing the cone flash. */
const FLASH_DURATION = 0.15;
/** Pixels beyond min range for the cone. */
const MAX_RANGE = 50;
const DAMAGE = 6;
const CONE_HALF_ANGLE_DEG = 45;
const RED = 0xff0000;

function getMinRadius(caster: Unit): number {
    return caster.radius + 5;
}

function getMaxRadius(caster: Unit): number {
    return getMinRadius(caster) + MAX_RANGE;
}

interface GameEngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    getUnit?(id: string): Unit | undefined;
}

function getTargetPosition(caster: Unit, active: { targets: ResolvedTarget[] }): { x: number; y: number } | null {
    if (isAbilityNote(caster.abilityNote, '0002')) {
        return caster.abilityNote.abilityNote.position;
    }
    return getPixelTargetPosition(active.targets, 0);
}

const ENEMY_MELEE_ATTACK_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L32 56 M28 12 L36 12 M28 52 L36 52" stroke="#5d4e37" stroke-width="2" fill="none"/>
  <rect x="28" y="24" width="8" height="24" rx="2" fill="#654321"/>
  <circle cx="32" cy="32" r="6" fill="#2d2d2d"/>
</svg>`;

export const EnemyMeleeAttackAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Enemy Melee Attack',
    image: ENEMY_MELEE_ATTACK_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'lock', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'strike',
            start: LOCK_TIME,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Active,
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 2.5,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: getMaxRadius({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getTooltipText(_gameState?: unknown): string[] {
        return [`Strike in a cone dealing {${DAMAGE}} damage to enemies`];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < LOCK_TIME) return [];
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        // Keep ability "active" briefly so we can draw the hit flash (no movement penalty).
        if (currentTime < PREFIRE_TIME + FLASH_DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 1 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const target = targets[0];
            if (target?.type === 'pixel' && target.position) {
                caster.setAbilityNote({ abilityId: '0002', abilityNote: { position: { ...target.position } } });
            }
        }

        if (prevTime < PREFIRE_TIME && currentTime >= PREFIRE_TIME) {
            const eng = engine as GameEngineLike;
            if (!isAbilityNote(caster.abilityNote, '0002')) return;
            const pos = caster.abilityNote.abilityNote.position;
            caster.clearAbilityNote();

            const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
            const minR = getMinRadius(caster);
            const maxR = getMaxRadius(caster);
            const halfAngleRad = (CONE_HALF_ANGLE_DEG * Math.PI) / 180;
            const damageParams = {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: CARD_ID,
                damage: DAMAGE,
                attackType: 'melee' as const,
            };

            for (const unit of eng.units) {
                if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
                if (unit.hasIFrames(eng.gameTime)) continue;
                if (!pointInCone(caster.x, caster.y, unit.x, unit.y, dirX, dirY, minR, maxR, halfAngleRad)) continue;
                tryDamageOrBlock(unit, damageParams);
            }
        }
    },

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
        const minR = getMinRadius(caster);
        const maxR = getMaxRadius(caster);
        const flash = elapsed >= PREFIRE_TIME && elapsed < PREFIRE_TIME + FLASH_DURATION;
        drawConeSlice(gr, caster.x, caster.y, angle, halfRad, minR, maxR, {
            fillColor: RED,
            fillAlpha: flash ? 0.5 : 0.2,
            strokeColor: RED,
            strokeAlpha: flash ? 0.9 : 0.45,
        });
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Melee blocked: no additional behaviour.
    },
};

export const EnemyMeleeAttackCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Enemy Melee Attack',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
