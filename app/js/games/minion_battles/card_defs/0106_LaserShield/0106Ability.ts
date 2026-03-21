/**
 * Laser Shield - Warrior skill. Hold a cyan energy shield for 3s in a direction.
 * Movement speed penalty 0.1, blocks attacks from within a 120° arc.
 * Single use. Owner draws a card when the ability blocks (max once per use).
 * Same behaviour as Raise Shield, but longer duration and laser color theme.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createArcTargetPreview, drawArcWedge } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { isAbilityNote } from '../../engine/AbilityNote';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { drawCardForPlayer, getNearestAlly } from '../../abilities/effectHelpers';
import { getDirectionFromTo } from '../../abilities/targetHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}06`;
const DURATION = 3;
const COOLDOWN_TIME = 1;
const MOVEMENT_PENALTY = 0.1;
/** Max number of cards the owner can draw from blocking per card use. */
const MAX_DRAW_PER_USE = 1;
const SHIELD_ARC_DEG = 120;
const SHIELD_ARC_RAD = (SHIELD_ARC_DEG * Math.PI) / 180;
const SHIELD_HALF_ARC_RAD = SHIELD_ARC_RAD / 2;
// Inner radius is the "start" of the visual block, so keep it slightly outside the unit.
const SHIELD_INNER_OFFSET = 2; // from creature's size (radius)
const SHIELD_THICKNESS_PX = 15;
const SHIELD_FILL_ALPHA = 0.85;
const SHIELD_STROKE_ALPHA = 1.0;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

interface GameEngineLike {
    getUnit(id: string): Unit | undefined;
    units: Unit[];
    drawCardsForPlayer(playerId: string, count: number): number;
    cards: Record<string, { location: string }[]>;
}

const LASER_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ls_shield" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4fb8c8"/>
      <stop offset="0.5" stop-color="#7fdfef"/>
      <stop offset="1" stop-color="#afffff"/>
    </linearGradient>
  </defs>
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="url(#ls_shield)" stroke="#4fb8c8" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#163a3f"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#afffff" stroke-width="2"/>
</svg>`;

export const LaserShieldAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Laser Shield',
    image: LASER_SHIELD_IMAGE,
    cooldownTime: COOLDOWN_TIME,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DURATION,
    abilityTimings: [
        { duration: DURATION, abilityPhase: AbilityPhase.Juggernaut },
        { duration: COOLDOWN_TIME, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            'Raise a laser shield blocking all attacks from the front',
            'If you block an attack, draw a card',
            'Your nearest ally draws a card when used',
            'Lasts for 3 seconds with only 1 second cooldown',
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
        caster.setAbilityNote({ abilityId: '0106', abilityNote: { drewFromBlockCount: 0 } });
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
        });
    },

    renderTargetingPreview: createArcTargetPreview({
        arcDeg: SHIELD_ARC_DEG,
        innerOffset: SHIELD_INNER_OFFSET,
        outerThickness: SHIELD_THICKNESS_PX,
        fillAlpha: SHIELD_FILL_ALPHA,
        strokeAlpha: SHIELD_STROKE_ALPHA,
    }),

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Not used; we are the blocker, not the attacker.
    },

    onBlockSuccess(engine: unknown, defender: Unit, _attackInfo: AttackBlockedInfo): void {
        if (!defender.ownerId) return;
        const note = defender.abilityNote;
        if (!isAbilityNote(note, '0106')) return;
        if (note.abilityNote.drewFromBlockCount >= MAX_DRAW_PER_USE) return;
        const eng = engine as GameEngineLike;
        eng.drawCardsForPlayer(defender.ownerId, 1);
        defender.setAbilityNote({
            abilityId: '0106',
            abilityNote: { drewFromBlockCount: note.abilityNote.drewFromBlockCount + 1 },
        });
    },
};

export const LaserShieldCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Laser Shield',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};

