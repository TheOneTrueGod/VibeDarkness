/**
 * Shining Block - Crystal shield variant. Hold a shield for 1s in a direction.
 * Same blocking arc as Raise Shield. On first block: flash retaliation in a cone
 * toward the attacker - 5 damage to up to 3 enemies, stun 2s, ConeFlash effect.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview, drawArcWedge } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { isAbilityNote } from '../../game/AbilityNote';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { drawCardForPlayer, getNearestAlly, createCrystalLightEffect } from '../../abilities/effectHelpers';
import { getDirectionFromTo } from '../../abilities/targetHelpers';
import { pointInCone } from '../../abilities/targetHelpers';
import { Effect } from '../../game/effects/Effect';
import { StunnedBuff } from '../../buffs/StunnedBuff';
import { areEnemies } from '../../game/teams';
import type { EventBus } from '../../game/EventBus';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}10` as '0110';
const DURATION = 1;
const COOLDOWN_TIME = 1;
const MOVEMENT_PENALTY = 0.1;
const MAX_RETALIATION_PER_USE = 1;
const SHIELD_ARC_DEG = 120;
const SHIELD_ARC_RAD = (SHIELD_ARC_DEG * Math.PI) / 180;
const SHIELD_HALF_ARC_RAD = SHIELD_ARC_RAD / 2;
const SHIELD_INNER_OFFSET = 5;
const SHIELD_THICKNESS_PX = 10;
const SHIELD_FILL_ALPHA = 0.9;
const SHIELD_STROKE_ALPHA = 0.9;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

/** Retaliation cone params. */
const RETALIATION_RANGE = 200;
const RETALIATION_DAMAGE = 5;
const RETALIATION_MAX_TARGETS = 3;
const STUN_DURATION = 2;
const CONE_FLASH_DURATION = 0.3;

const SHIELD_FILL_COLOR = 0x27d3c8; // crystal teal
const SHIELD_STROKE_COLOR = 0x1a9d94;

interface GameEngineLike {
    getUnit(id: string): Unit | undefined;
    units: Unit[];
    addEffect(effect: Effect): void;
    eventBus: EventBus;
    gameTime: number;
    roundNumber: number;
}

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

function executeShiningBlockRetaliation(engine: GameEngineLike, defender: Unit, attackInfo: AttackBlockedInfo): void {
    const srcX = attackInfo.attackSourceX;
    const srcY = attackInfo.attackSourceY;
    if (srcX === undefined || srcY === undefined) return;

    const { dirX, dirY } = getDirectionFromTo(defender.x, defender.y, srcX, srcY);
    const minR = defender.radius;
    const maxR = RETALIATION_RANGE + defender.radius;

    const enemiesInCone: { unit: Unit; dist: number }[] = [];
    for (const u of engine.units) {
        if (!u.isAlive() || !areEnemies(defender.teamId, u.teamId)) continue;
        if (!pointInCone(defender.x, defender.y, u.x, u.y, dirX, dirY, minR, maxR, SHIELD_HALF_ARC_RAD)) continue;
        const dist = Math.hypot(u.x - defender.x, u.y - defender.y);
        enemiesInCone.push({ unit: u, dist });
    }
    enemiesInCone.sort((a, b) => a.dist - b.dist);
    const toHit = enemiesInCone.slice(0, RETALIATION_MAX_TARGETS);

    for (const { unit } of toHit) {
        unit.takeDamage(RETALIATION_DAMAGE, defender.id, engine.eventBus);
        const stun = new StunnedBuff(STUN_DURATION);
        unit.addBuff(stun, engine.gameTime, engine.roundNumber);
        unit.interruptAllAbilities();
    }

    const centerAngle = Math.atan2(dirY, dirX);
    const flash = new Effect({
        x: defender.x,
        y: defender.y,
        duration: CONE_FLASH_DURATION,
        effectType: 'ConeFlash',
        effectData: {
            centerAngle,
            halfArcRad: SHIELD_HALF_ARC_RAD,
            innerR: 0,
            outerR: RETALIATION_RANGE,
        },
    });
    engine.addEffect(flash);

    engine.addEffect(createCrystalLightEffect(defender.x, defender.y));
}

export const ShiningBlockAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Shining Block',
    image: SHINING_BLOCK_IMAGE,
    cooldownTime: COOLDOWN_TIME,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DURATION,
    abilityTimings: [
        { duration: DURATION, abilityPhase: AbilityPhase.Juggernaut },
    ],
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise your crystal shield blocking all attacks from the front',
            'On Block: Deals {5} damage and stuns up to {3} enemies for {2} seconds',
            'Your nearest ally draws a card when used',
        ];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: MOVEMENT_PENALTY } }];
        }
        return [];
    },

    getBlockingArc(caster: Unit, activeAbility: { targets: ResolvedTarget[] }, currentTime: number) {
        if (currentTime < 0 || currentTime >= DURATION) return null;
        const pos = activeAbility.targets[0]?.position;
        if (!pos) return null;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return null;
        const centerAngle = Math.atan2(dirY, dirX);
        return {
            arcStartAngle: centerAngle - SHIELD_HALF_ARC_RAD,
            arcEndAngle: centerAngle + SHIELD_HALF_ARC_RAD,
        };
    },

    doCardEffect(engine: unknown, caster: Unit, _targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.05 || currentTime < 0.05) return;
        const eng = engine as GameEngineLike;
        caster.setAbilityNote({ abilityId: CARD_ID, abilityNote: { retaliationCount: 0 } });
        const nearestAlly = getNearestAlly(eng.units, caster);
        drawCardForPlayer(engine, nearestAlly?.ownerId, 1);
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        _gameTime: number,
    ): void {
        const pos = activeAbility.targets[0]?.position;
        if (!pos) return;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return;
        const centerAngle = Math.atan2(dirY, dirX);
        const innerR = caster.radius + SHIELD_INNER_OFFSET;
        const outerR = caster.radius + SHIELD_THICKNESS_PX;
        drawArcWedge(gr, caster.x, caster.y, centerAngle, SHIELD_HALF_ARC_RAD, innerR, outerR, 24, {
            fillAlpha: SHIELD_FILL_ALPHA,
            strokeAlpha: SHIELD_STROKE_ALPHA,
            strokeColor: SHIELD_STROKE_COLOR,
            fillColor: SHIELD_FILL_COLOR,
        });
    },

    renderTargetingPreview: createArcTargetPreview({
        arcDeg: SHIELD_ARC_DEG,
        innerOffset: SHIELD_INNER_OFFSET,
        outerThickness: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
        strokeColor: SHIELD_STROKE_COLOR,
        fillColor: SHIELD_FILL_COLOR,
    }),

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Not used; we are the blocker.
    },

    onBlockSuccess(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void {
        const note = defender.abilityNote;
        if (!isAbilityNote(note, CARD_ID)) return;
        if (note.abilityNote.retaliationCount >= MAX_RETALIATION_PER_USE) return;
        const eng = engine as GameEngineLike;
        executeShiningBlockRetaliation(eng, defender, attackInfo);
        defender.setAbilityNote({
            abilityId: CARD_ID,
            abilityNote: { retaliationCount: note.abilityNote.retaliationCount + 1 },
        });
    },
};

export const ShiningBlockCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Shining Block',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
