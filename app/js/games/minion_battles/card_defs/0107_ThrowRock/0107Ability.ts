/**
 * ThrowRock - A basic ranged ability.
 *
 * Targets a pixel. After 0.3s, creates a projectile that travels
 * 200px in a straight line toward the target. Deals 5 damage on hit.
 * Cooldown: 1.3s. No resource cost. Recharge: 1 round.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../objects/Unit';
import { Projectile } from '../../objects/Projectile';
import { asCardDefId, type CardDef } from '../types';

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
}

const THROW_ROCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 4 L32 12 L36 24 L28 36 L12 34 L4 20 Z" fill="#6b6b6b" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M12 14 L20 10 L28 16 L30 26 L22 32 L12 28 Z" fill="#7a7a7a"/>
  <path d="M16 20 L24 16 L26 24 L18 28 Z" fill="#525252"/>
</svg>`;

export const ThrowRock: AbilityStatic = {
    id: 'throw_rock',
    name: 'Throw Rock',
    image: THROW_ROCK_IMAGE,
    cooldownTime: 1.3,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: [
        { duration: 0.3, abilityPhase: AbilityPhase.Windup },
        { duration: 1.3, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    getTargets(): TargetDef[] {
        return this.targets;
    },
    aiSettings: { minRange: 0, maxRange: 200 },

    getTooltipText(_gameState?: unknown): string[] {
        return ['Throws a rock dealing {5} damage to an enemy'];
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        const states: AbilityStateEntry[] = [];
        if (currentTime < 0.6) {
            states.push({ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0.3 } });
        }
        return states;
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < 0.3 && currentTime >= 0.3) {
            const eng = engine as GameEngineLike;
            const target = targets[0];
            if (!target || target.type !== 'pixel' || !target.position) return;

            const dx = target.position.x - caster.x;
            const dy = target.position.y - caster.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return;

            const speed = 900;
            const velocityX = (dx / dist) * speed;
            const velocityY = (dy / dist) * speed;

            const projectile = new Projectile({
                x: caster.x,
                y: caster.y,
                velocityX,
                velocityY,
                damage: 5,
                sourceTeamId: caster.teamId,
                sourceUnitId: caster.id,
                sourceAbilityId: 'throw_rock',
                maxDistance: 200,
            });

            eng.addProjectile(projectile);
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },

    renderTargetingPreview: createPixelTargetPreview(200),
};

export const ThrowRockCard: CardDef = {
    id: asCardDefId('throw_rock'),
    name: 'Throw Rock',
    abilityId: 'throw_rock',
    durability: 3,
    discardDuration: { duration: 1, unit: 'rounds' },
};
