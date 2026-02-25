/**
 * ChannelDarkness - AI-only channel (2s) that damages a DefendPoint by 1.
 * Movement penalty 0 while channeling. 5s cooldown.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { Unit } from '../../../objects/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ResolvedTarget } from '../../../engine/types';

const CHANNEL_DURATION = 2;
const COOLDOWN = 5;
const RADIUS_EXPAND = 50;
const PURPLE_FILL = 0x4a0080;
const PURPLE_OUTLINE = 0x2d004d;

interface GameEngineLike {
    damageSpecialTile(tileId: string, amount: number): void;
}

const CHANNEL_DARKNESS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#2d004d" stroke="#4a0080" stroke-width="2"/>
  <circle cx="32" cy="32" r="16" fill="#1a0030" opacity="0.8"/>
</svg>`;

export const ChannelDarknessAbility: AbilityStatic = {
    id: 'channel_darkness',
    name: 'Channel Darkness',
    image: CHANNEL_DARKNESS_IMAGE,
    cooldownTime: COOLDOWN,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: CHANNEL_DURATION,
    targets: [{ type: 'specialTile', label: 'Defend Point' }] as TargetDef[],

    getDescription(_gameState?: unknown): string {
        return `Channel for ${CHANNEL_DURATION}s to deal 1 damage to the target Defend Point. Movement penalty 0 while channeling.`;
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < CHANNEL_DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= CHANNEL_DURATION || currentTime < CHANNEL_DURATION) return;
        const t = targets[0];
        if (t?.type !== 'specialTile' || !t.specialTileId) return;
        (engine as GameEngineLike).damageSpecialTile(t.specialTileId, 1);
    },

    renderPreview(
        _ctx: CanvasRenderingContext2D,
        _caster: Unit,
        _currentTargets: ResolvedTarget[],
        _mouseWorld: { x: number; y: number },
    ): void {
        // AI-only; no player targeting preview
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number },
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed < 0 || elapsed > CHANNEL_DURATION) return;

        const progress = Math.min(1, elapsed / CHANNEL_DURATION);
        const minR = caster.radius;
        const maxR = caster.radius + RADIUS_EXPAND;
        const currentR = minR + (maxR - minR) * progress;

        gr.circle(caster.x, caster.y, currentR);
        gr.fill({ color: PURPLE_FILL, alpha: 0.25 });

        gr.circle(caster.x, caster.y, maxR);
        gr.stroke({ color: PURPLE_OUTLINE, width: 3, alpha: 0.7 });
    },
};

export const ChannelDarknessCard: CardDef = {
    id: 'channel_darkness',
    name: 'Channel Darkness',
    abilityId: 'channel_darkness',
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
