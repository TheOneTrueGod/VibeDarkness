/**
 * Shining Block - Crystal shield variant. Hold a shield for 1s in a direction.
 * Same blocking arc as Raise Shield. On first block: flash retaliation in a cone
 * toward the attacker - 5 damage to up to 3 enemies, stun 2s, ConeFlash effect.
 */

import { AbilityEventType } from '../../abilities/Ability';
import type { AbilityStatic } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview } from '../../abilities/previewHelpers';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import {
    createDirectionalBlockingArc,
    createMovementPenaltyStates,
    createShieldActivePreview,
    STANDARD_SHIELD_HALF_ARC_RAD,
} from '../../abilities/shieldHelpers';
import { createCrystalLightEffect } from '../../abilities/effectHelpers';
import { getDirectionFromTo, pointInCone } from '../../abilities/targetHelpers';
import { Effect } from '../../game/effects/Effect';
import { tryApplyHardCcStun } from '../../crowdControl/tryApplyHardCcStun';
import { areEnemies } from '../../game/teams';
import { grantRecoveryChargeToRandomAbility } from '../../abilities/abilityUses';
import { TECH_SHIELD_NODE_STRENGTHENING_LIGHT, TECH_SHIELD_TREE_ID } from '../../../../researchTrees/trees/tech_shield';
import { getModifiedAbilityDamage } from '../../abilities/damageModifiers';
import type { AbilityEventRuntimeContext } from '../../abilities/events/AbilityEventRuntime';
import type { AttackBlockedInfo } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import type { EventBus } from '../../game/EventBus';
import type { LightSource } from '../../game/lightSources/LightSource';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}10` as '0110';
const DURATION = 1;
const MOVEMENT_PENALTY = 0.1;
const SHIELD_ARC_DEG = 120;
const SHIELD_INNER_OFFSET = 5;
const SHIELD_THICKNESS_PX = 10;
const SHIELD_FILL_ALPHA = 0.9;
const SHIELD_STROKE_ALPHA = 0.9;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

const SHIELD_FILL_COLOR = 0x27d3c8;
const SHIELD_STROKE_COLOR = 0x1a9d94;

const RETALIATION_RANGE = 200;
const RETALIATION_DAMAGE = 5;
const RETALIATION_MAX_TARGETS = 3;
const STUN_DURATION = 2;
const CONE_FLASH_DURATION = 0.3;
const STRENGTHENING_LIGHT_HEAL_RADIUS = 50;
const STRENGTHENING_LIGHT_HEAL_AMOUNT = 5;

const SHINING_BLOCK_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sb_shield" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a9d94"/>
      <stop offset="0.5" stop-color="#27d3c8"/>
      <stop offset="1" stop-color="#5eead4"/>
    </linearGradient>
  </defs>
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="url(#sb_shield)" stroke="#1a9d94" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#0d4d47"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#5eead4" stroke-width="2"/>
</svg>`;

interface RetalEngineCtx {
    units: Unit[];
    addEffect(effect: Effect): void;
    addLightSource(ls: LightSource): void;
    eventBus: EventBus;
    gameTime: number;
    roundNumber: number;
    generateRandomInteger(min: number, max: number): number;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
}

function executeShiningBlockRetaliation(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void {
    const srcX = attackInfo.attackSourceX;
    const srcY = attackInfo.attackSourceY;
    if (srcX === undefined || srcY === undefined) return;

    const eng = engine as RetalEngineCtx;
    const { dirX, dirY } = getDirectionFromTo(defender.x, defender.y, srcX, srcY);
    const minR = defender.radius;
    const maxR = RETALIATION_RANGE + defender.radius;

    const enemiesInCone: { unit: Unit; dist: number }[] = [];
    for (const u of eng.units) {
        if (!u.isAlive() || !areEnemies(defender.teamId, u.teamId)) continue;
        if (!pointInCone(defender.x, defender.y, u.x, u.y, dirX, dirY, minR, maxR, STANDARD_SHIELD_HALF_ARC_RAD)) continue;
        const dist = Math.hypot(u.x - defender.x, u.y - defender.y);
        enemiesInCone.push({ unit: u, dist });
    }
    enemiesInCone.sort((a, b) => a.dist - b.dist);

    for (const { unit } of enemiesInCone.slice(0, RETALIATION_MAX_TARGETS)) {
        const modifiedDamage = getModifiedAbilityDamage(defender, RETALIATION_DAMAGE);
        unit.takeDamage(modifiedDamage, defender.id, eng.eventBus);
        const stunResult = tryApplyHardCcStun(unit, STUN_DURATION, eng.gameTime, eng.roundNumber);
        if (stunResult.outcome === 'applied') {
            unit.interruptAllAbilities();
        }
    }

    const centerAngle = Math.atan2(dirY, dirX);
    eng.addEffect(new Effect({
        x: defender.x,
        y: defender.y,
        duration: CONE_FLASH_DURATION,
        effectType: 'ConeFlash',
        effectData: {
            centerAngle,
            halfArcRad: STANDARD_SHIELD_HALF_ARC_RAD,
            innerR: 0,
            outerR: RETALIATION_RANGE,
        },
    }));
    eng.addLightSource(createCrystalLightEffect(defender.x, defender.y));
}

function applyStrengtheningLightHeal(engine: unknown, defender: Unit): void {
    const eng = engine as { units: Unit[] };
    for (const unit of eng.units) {
        if (!unit.isAlive()) continue;
        if (areEnemies(unit.teamId, defender.teamId)) continue;
        if (Math.hypot(unit.x - defender.x, unit.y - defender.y) > STRENGTHENING_LIGHT_HEAL_RADIUS) continue;
        unit.hp = Math.min(unit.maxHp, unit.hp + STRENGTHENING_LIGHT_HEAL_AMOUNT);
    }
}

function grantLightChargesToNearbyAllies(engine: unknown, defender: Unit): void {
    const eng = engine as { units: Unit[]; generateRandomInteger(min: number, max: number): number };
    for (const unit of eng.units) {
        if (!unit.isAlive() || unit.id === defender.id) continue;
        if (areEnemies(unit.teamId, defender.teamId)) continue;
        if (Math.hypot(unit.x - defender.x, unit.y - defender.y) > 180) continue;
        grantRecoveryChargeToRandomAbility(unit, 'lightCharge', (min, max) => eng.generateRandomInteger(min, max));
    }
}

export const ShiningBlockAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Shining Block',
    image: SHINING_BLOCK_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DURATION,
    abilityTimings: [
        {
            id: 'juggernaut',
            start: 0,
            end: DURATION,
            abilityPhase: AbilityPhase.Juggernaut,
        },
    ],
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise your crystal shield blocking all attacks from the front',
            'On Block: Deals {5} damage and stuns up to {3} enemies for {2} seconds.',
            'Nearby allies gain {2} stamina surges, {1} light charge, and heal for 5',
        ];
    },

    getAbilityStates: createMovementPenaltyStates(MOVEMENT_PENALTY, DURATION),

    getBlockingArc: createDirectionalBlockingArc({
        blockDuration: DURATION,
        halfArcRad: STANDARD_SHIELD_HALF_ARC_RAD,
    }),

    renderActivePreview: createShieldActivePreview({
        blockDuration: DURATION,
        halfArcRad: STANDARD_SHIELD_HALF_ARC_RAD,
        innerOffset: SHIELD_INNER_OFFSET,
        thicknessPx: SHIELD_THICKNESS_PX,
        fillColor: SHIELD_FILL_COLOR,
        strokeColor: SHIELD_STROKE_COLOR,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
    }),

    renderTargetingPreview: createArcTargetPreview({
        arcDeg: SHIELD_ARC_DEG,
        innerOffset: SHIELD_INNER_OFFSET,
        outerThickness: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
        strokeColor: SHIELD_STROKE_COLOR,
        fillColor: SHIELD_FILL_COLOR,
    }),

    abilityEvents: {
        [AbilityEventType.ON_BLOCK_SUCCESS]: [
            {
                maxTriggersPerCast: 1,
                conditions: [{ type: 'always' }],
                effects: [
                    {
                        type: 'grantChargeToNearbyAllies',
                        chargeType: 'staminaCharge',
                        amount: 2,
                        radius: 50,
                    },
                    {
                        type: 'custom',
                        effectId: 'shiningBlockLightCharges',
                        comment: 'Grant 1 light charge to allies within 180px.',
                    },
                    {
                        type: 'custom',
                        effectId: 'shiningBlockConeFlash',
                        comment: '5 dmg + 2s stun to up to 3 enemies in cone toward attackInfo source; ConeFlash effect + crystal light.',
                    },
                ],
            },
            {
                maxTriggersPerCast: 1,
                conditions: [
                    {
                        type: 'casterHasResearchNode',
                        treeId: TECH_SHIELD_TREE_ID,
                        nodeId: TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
                    },
                ],
                effects: [
                    {
                        type: 'custom',
                        effectId: 'shiningBlockHeal',
                        comment: 'Heal allies within 50px for 5 hp.',
                    },
                ],
            },
        ],
    },

    customEffectHandlers: {
        shiningBlockLightCharges: (_params, ctx) => {
            const c = ctx as AbilityEventRuntimeContext;
            grantLightChargesToNearbyAllies(c.engine, c.caster);
        },
        shiningBlockConeFlash: (_params, ctx) => {
            const c = ctx as AbilityEventRuntimeContext;
            if (!c.attackInfo) {
                console.warn('shiningBlockConeFlash fired without attackInfo â€” skipping retaliation');
                return;
            }
            executeShiningBlockRetaliation(c.engine, c.caster, c.attackInfo);
        },
        shiningBlockHeal: (_params, ctx) => {
            const c = ctx as AbilityEventRuntimeContext;
            applyStrengtheningLightHeal(c.engine, c.caster);
        },
    },
};

export const ShiningBlockCard: CardDef = {
    abilityId: CARD_ID,
};
