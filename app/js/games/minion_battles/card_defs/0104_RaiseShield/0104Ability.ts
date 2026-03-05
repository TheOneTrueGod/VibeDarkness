/**
 * Raise Shield - Warrior skill. Hold a shield for 1s in a direction.
 * Movement speed penalty 0.1, blocks attacks from within a 120° arc.
 * Single use: caster and nearest ally each draw 1 card (capped by hand size).
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../abilities/Ability';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import type { CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}04`;
const DURATION = 1;
const MOVEMENT_PENALTY = 0.1;
const SHIELD_ARC_DEG = 120;
const SHIELD_ARC_RAD = (SHIELD_ARC_DEG * Math.PI) / 180;
const SHIELD_HALF_ARC_RAD = SHIELD_ARC_RAD / 2;
const SHIELD_INNER_OFFSET = 0; // from creature's size (radius)
const SHIELD_THICKNESS_PX = 5;
const MAX_RANGE = 300;
const MIN_RANGE = 10;

interface GameEngineLike {
    getUnit(id: string): Unit | undefined;
    units: Unit[];
    drawCardsForPlayer(playerId: string, count: number): number;
    cards: Record<string, { location: string }[]>;
}

const RAISE_SHIELD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L52 32 L32 56 L12 32 Z" fill="#6B8E6B" stroke="#4A6B4A" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#3d5c3d"/>
  <path d="M32 20 L32 44 M26 32 L38 32" stroke="#8B7355" stroke-width="2"/>
</svg>`;

export const RaiseShieldAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Raise Shield',
    image: RAISE_SHIELD_IMAGE,
    cooldownTime: 1,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DURATION,
    targets: [{ type: 'pixel', label: 'Direction to block' }] as TargetDef[],
    aiSettings: { minRange: MIN_RANGE, maxRange: MAX_RANGE },

    getDescription(_gameState?: unknown): string {
        return `Raise a shield for ${DURATION}s in the target direction. Movement slowed to ${MOVEMENT_PENALTY * 100}% speed. Blocks attacks from a 120° arc. You and the nearest ally each draw 1 card. Single use.`;
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: MOVEMENT_PENALTY } }];
        }
        return [];
    },

    getBlockingArc(caster: Unit, activeAbility: { targets: ResolvedTarget[] }, currentTime: number) {
        if (currentTime < 0 || currentTime >= DURATION) return null;
        const target = activeAbility.targets[0];
        if (!target?.position) return null;
        const dx = target.position.x - caster.x;
        const dy = target.position.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return null;
        const centerAngle = Math.atan2(dy, dx);
        return {
            arcStartAngle: centerAngle - SHIELD_HALF_ARC_RAD,
            arcEndAngle: centerAngle + SHIELD_HALF_ARC_RAD,
        };
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as GameEngineLike;
        // One-shot: on first tick, nearest ally and caster each draw 1
        if (prevTime >= 0.05 || currentTime < 0.05) return;

        // Nearest ally (same team, not self, alive)
        let nearestAlly: Unit | null = null;
        let nearestDistSq = Infinity;
        for (const u of eng.units) {
            if (!u.isAlive() || u.id === caster.id || u.teamId !== caster.teamId) continue;
            const dx = u.x - caster.x;
            const dy = u.y - caster.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < nearestDistSq) {
                nearestDistSq = d2;
                nearestAlly = u;
            }
        }
        if (nearestAlly?.ownerId) {
            eng.drawCardsForPlayer(nearestAlly.ownerId, 1);
        }
        if (caster.ownerId) {
            eng.drawCardsForPlayer(caster.ownerId, 1);
        }
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
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;
        const endX = caster.x + dirX * Math.min(MAX_RANGE, dist || MAX_RANGE);
        const endY = caster.y + dirY * Math.min(MAX_RANGE, dist || MAX_RANGE);
        ctx.save();
        ctx.strokeStyle = 'rgba(107, 142, 107, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.restore();
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        _gameTime: number,
    ): void {
        const target = activeAbility.targets[0]?.position;
        if (!target) return;
        const dx = target.x - caster.x;
        const dy = target.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const centerAngle = Math.atan2(dy, dx);
        const startAngle = centerAngle - SHIELD_HALF_ARC_RAD;
        const endAngle = centerAngle + SHIELD_HALF_ARC_RAD;
        const innerR = caster.radius + SHIELD_INNER_OFFSET;
        const outerR = caster.radius + SHIELD_THICKNESS_PX;
        const segments = 24;
        // Build closed path: outer arc from start to end, then inner arc from end to start
        gr.moveTo(
            caster.x + outerR * Math.cos(startAngle),
            caster.y + outerR * Math.sin(startAngle),
        );
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const a = startAngle + t * SHIELD_ARC_RAD;
            gr.lineTo(caster.x + outerR * Math.cos(a), caster.y + outerR * Math.sin(a));
        }
        for (let i = segments - 1; i >= 0; i--) {
            const t = i / segments;
            const a = startAngle + t * SHIELD_ARC_RAD;
            gr.lineTo(caster.x + innerR * Math.cos(a), caster.y + innerR * Math.sin(a));
        }
        gr.lineTo(
            caster.x + outerR * Math.cos(startAngle),
            caster.y + outerR * Math.sin(startAngle),
        );
        gr.fill({ color: 0x6b8e6b, alpha: 0.5 });
        gr.stroke({ color: 0x4a6b4a, width: 2, alpha: 0.9 });
    },

    renderTargetingPreview: createPixelTargetPreview(MAX_RANGE),

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Optional: play sound, increment counter, etc.
    },
};

export const RaiseShieldCard: CardDef = {
    id: CARD_ID,
    name: 'Raise Shield',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
