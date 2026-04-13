/**
 * Claw - Warrior card. Dodge-like dash toward target with iframes.
 * Damages and knocks back any enemies the caster touches during the dash.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Effect } from '../../game/effects/Effect';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { applyForcedDisplacementToward } from '../../abilities/effectHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { getBodyColor, getCharacterSpriteKey } from '../../game/units/unit_defs/unitDef';
import { areEnemies } from '../../game/teams';
import { isAbilityNote } from '../../game/AbilityNote';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import type { EventBus } from '../../game/EventBus';
import type { Effect as EffectType } from '../../game/effects/Effect';
import { grantRecoveryChargeToRandomAbility } from '../../abilities/abilityUses';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}11`;
const CLAW_DURATION = 0.4;
const CLAW_MAX_DISTANCE = 160;
const COLLISION_STEP = 4;
const DAMAGE = 5;
const POISE_DAMAGE = 4;
const KNOCKBACK_MAGNITUDE = 40;
const KNOCKBACK_AIR_TIME = 0.2;
const KNOCKBACK_SLIDE_TIME = 0.12;
const AFTERIMAGE_DURATION = 6 / 60;

interface GameEngineLike {
    units: Unit[];
    addEffect(e: EffectType): void;
    gameTime: number;
    eventBus: EventBus;
    interruptUnitAndRefundAbilities(unit: Unit): void;
    generateRandomInteger(min: number, max: number): number;
}

const CLAW_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 44 L28 32 L36 40 L44 28 M24 48 L32 36 L40 44" stroke="#6b5b4f" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="14" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const ClawAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Claw',
    image: CLAW_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: CLAW_DURATION,
    abilityTimings: [
        {
            id: 'dash',
            start: 0,
            end: CLAW_DURATION,
            abilityPhase: AbilityPhase.Iframe,
        },
        {
            id: 'cooldown',
            start: CLAW_DURATION,
            end: CLAW_DURATION + 0.8,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Direction to dash' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: CLAW_MAX_DISTANCE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Dash toward a point with iframes',
            `Deal {${DAMAGE}} damage and knock back enemies you touch`,
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < CLAW_DURATION) {
            return [{ state: AbilityState.IFRAMES }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as GameEngineLike;

        if (prevTime < 0.05 && currentTime >= 0.05) {
            caster.setAbilityNote({ abilityId: CARD_ID, abilityNote: { hitTargetIds: [] } });
            grantRecoveryChargeToRandomAbility(
                caster,
                'staminaCharge',
                (min, max) => eng.generateRandomInteger(min, max),
                { excludeAbilityId: CARD_ID },
            );
        }

        if (currentTime >= CLAW_DURATION) {
            caster.clearAbilityNote();
            return;
        }

        const pos = getPixelTargetPosition(targets, 0);
        const dirResult = pos ? getDirectionFromTo(caster.x, caster.y, pos.x, pos.y) : null;
        const distToTarget = dirResult?.dist ?? 0;
        const moveDistance =
            distToTarget > 0
                ? Math.min(
                      ((currentTime - prevTime) / CLAW_DURATION) * CLAW_MAX_DISTANCE,
                      distToTarget,
                  )
                : 0;

        const twoTickPeriods = Math.floor(currentTime * 30);
        const prevTwoTickPeriods = prevTime < 0 ? -1 : Math.floor(prevTime * 30);
        const isMoving = moveDistance > 0;

        for (let i = prevTwoTickPeriods + 1; i <= twoTickPeriods; i++) {
            const effectData: Record<string, unknown> = {
                bodyColor: getBodyColor(caster.characterId),
                radius: caster.radius,
                characterSpriteKey: getCharacterSpriteKey(caster.characterId),
            };
            if (isMoving && dirResult && dirResult.dist > 0) {
                const baseAngle = Math.atan2(-dirResult.dirY, -dirResult.dirX);
                const angleVariance = (Math.random() - 0.5) * 0.6;
                const speed = 30 + Math.random() * 20;
                effectData.vx = Math.cos(baseAngle + angleVariance) * speed;
                effectData.vy = Math.sin(baseAngle + angleVariance) * speed;
            } else if (!isMoving) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 30 + Math.random() * 20;
                effectData.vx = Math.cos(angle) * speed;
                effectData.vy = Math.sin(angle) * speed;
            }
            eng.addEffect(
                new Effect({
                    x: caster.x,
                    y: caster.y,
                    duration: AFTERIMAGE_DURATION,
                    effectType: 'Afterimage',
                    effectData,
                }),
            );
        }

        if (pos && distToTarget > 0 && moveDistance > 0) {
            applyForcedDisplacementToward(engine, caster, pos.x, pos.y, moveDistance, { step: COLLISION_STEP });
        }

        if (isAbilityNote(caster.abilityNote, CARD_ID) && dirResult && dirResult.dist > 0) {
            const note = caster.abilityNote.abilityNote;
            const touchRadius = caster.radius;
            const moveDirX = dirResult.dirX;
            const moveDirY = dirResult.dirY;

            for (const unit of eng.units) {
                if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
                if (unit.id === caster.id) continue;
                if (note.hitTargetIds.includes(unit.id)) continue;
                if (unit.hasIFrames(eng.gameTime)) continue;

                const dx = unit.x - caster.x;
                const dy = unit.y - caster.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > touchRadius + unit.radius) continue;

                const blocked = !tryDamageOrBlock(unit, {
                    engine: eng,
                    gameTime: eng.gameTime,
                    eventBus: eng.eventBus,
                    attackerX: caster.x,
                    attackerY: caster.y,
                    attackerId: caster.id,
                    abilityId: CARD_ID,
                    damage: DAMAGE,
                    attackType: 'melee',
                });
                if (blocked) continue;

                note.hitTargetIds.push(unit.id);

                // Knockback perpendicular to movement. Cross product: moveDir x enemyVec = moveDirX*dy - moveDirY*dx
                // > 0: enemy is to the left of movement → push left (-moveDirY, moveDirX)
                // < 0: enemy is to the right → push right (moveDirY, -moveDirX)
                const cross = moveDirX * dy - moveDirY * dx;
                const perpX = cross > 0 ? -moveDirY : moveDirY;
                const perpY = cross > 0 ? moveDirX : -moveDirX;
                const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
                const knockX = perpLen > 0 ? (perpX / perpLen) * KNOCKBACK_MAGNITUDE : KNOCKBACK_MAGNITUDE;
                const knockY = perpLen > 0 ? (perpY / perpLen) * KNOCKBACK_MAGNITUDE : 0;

                unit.applyKnockback(
                    POISE_DAMAGE,
                    {
                        knockbackVector: { x: knockX, y: knockY },
                        knockbackAirTime: KNOCKBACK_AIR_TIME,
                        knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                        knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
                    },
                    eng.eventBus,
                    (u) => eng.interruptUnitAndRefundAbilities(u),
                );
            }
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Melee blocked: no additional behaviour.
    },

    renderTargetingPreview: createPixelTargetPreview(CLAW_MAX_DISTANCE),
};

export const ClawCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Claw',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
