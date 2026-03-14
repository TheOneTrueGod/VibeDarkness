/**
 * Throw Torch - Utility ability that places a burning torch on the ground.
 *
 * Targets a pixel within range 200. A torch projectile flies to the target;
 * when it lands, a torch effect is placed that emits light for 3 rounds,
 * decaying each round. Adds a Throw Torch card to a random ally's draw pile
 * (or the caster's if no allies); if the ally doesn't have the ability, it
 * is added to their ability list.
 */

import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { Effect } from '../../objects/Effect';
import { asCardDefId, type CardDef, type CardDefId } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';

const CARD_ID = `${formatGroupId(AbilityGroupId.Utility)}01`;
const PREFIRE_TIME = 0.2;
const MAX_RANGE = 200;
const TORCH_LIGHT_AMOUNT = 10;
const TORCH_RADIUS = 5;
const TORCH_ROUNDS = 3;
const TORCH_PROJECTILE_SPEED = 400;

interface GameEngineLike {
    addEffect(effect: Effect): void;
    roundNumber: number;
    transferCardToAllyDeck(caster: Unit, cardDefId: CardDefId, abilityId: string): void;
}

function getMaxRange(caster: Unit): number {
    return MAX_RANGE + caster.radius + DEFAULT_UNIT_RADIUS;
}

const THROW_TORCH_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="torchFlame" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffdd00"/>
      <stop offset="50%" stop-color="#ff6600"/>
      <stop offset="100%" stop-color="#cc3300" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <rect x="28" y="20" width="8" height="28" rx="2" fill="#5c4033" stroke="#3d2b1f"/>
  <ellipse cx="32" cy="18" rx="10" ry="12" fill="url(#torchFlame)"/>
  <ellipse cx="32" cy="16" rx="5" ry="6" fill="#fff8dc"/>
</svg>`;

export const ThrowTorchAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Throw Torch',
    image: THROW_TORCH_IMAGE,
    cooldownTime: 1.5,
    resourceCost: null,
    rechargeTurns: 2,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: PREFIRE_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: 1.5, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            `Place a torch on the ground that emits light`,
            `Lasts ${TORCH_ROUNDS} rounds`,
            `Transfer: Another ally gains this card in their draw pile`
        ];
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: getMaxRange(caster) };
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= PREFIRE_TIME || currentTime < PREFIRE_TIME) return;

        const target = targets[0];
        if (!target || target.type !== 'pixel' || !target.position) return;

        const eng = engine as GameEngineLike;
        const dx = target.position.x - caster.x;
        const dy = target.position.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = getMaxRange(caster);
        const placeX = dist > maxR ? caster.x + (dx / dist) * maxR : target.position.x;
        const placeY = dist > maxR ? caster.y + (dy / dist) * maxR : target.position.y;

        const travelDist = Math.sqrt(
            (placeX - caster.x) ** 2 + (placeY - caster.y) ** 2,
        );
        const travelTime = Math.max(0.15, travelDist / TORCH_PROJECTILE_SPEED);

        const torchProjectile = new Effect({
            x: placeX,
            y: placeY,
            duration: travelTime,
            effectType: 'TorchProjectile',
            startX: caster.x,
            startY: caster.y,
            effectData: {
                roundCreated: eng.roundNumber,
                initialLightAmount: TORCH_LIGHT_AMOUNT,
                initialRadius: TORCH_RADIUS,
                roundsTotal: TORCH_ROUNDS,
            },
        });
        eng.addEffect(torchProjectile);

        eng.transferCardToAllyDeck(caster, asCardDefId(CARD_ID), CARD_ID);
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Not an attack; no block behaviour.
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxR = getMaxRange(caster);
        const endX = dist > maxR ? caster.x + (dx / dist) * maxR : mouseWorld.x;
        const endY = dist > maxR ? caster.y + (dy / dist) * maxR : mouseWorld.y;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 180, 80, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(endX, endY, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 200, 100, 0.9)';
        ctx.fillStyle = 'rgba(255, 150, 50, 0.3)';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    },

    renderTargetingPreview: createPixelTargetPreview(MAX_RANGE),
};

export const ThrowTorchCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Throw Torch',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { unit: 'never' },
    tags: ['innate'],
};
