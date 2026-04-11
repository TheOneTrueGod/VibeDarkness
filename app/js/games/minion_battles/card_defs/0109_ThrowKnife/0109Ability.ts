/**
 * ThrowKnife - A basic ranged ability.
 *
 * Targets a pixel. After 0.3s, creates a projectile that travels
 * 200px in a straight line toward the target. Deals 5 damage on hit.
 * Cooldown: 2s. No resource cost. Recharge: 1 round.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { asCardDefId, type CardDef } from '../types';

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
}

const THROW_KNIFE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="28" y="8" width="8" height="32" rx="2" fill="#c0c0c0"/>
  <polygon points="32,4 26,14 38,14" fill="#e0e0e0"/>
  <rect x="26" y="40" width="12" height="6" rx="1" fill="#8B4513"/>
  <rect x="30" y="46" width="4" height="12" rx="1" fill="#6b3a10"/>
</svg>`;

export const ThrowKnife: AbilityStatic = {
    id: 'throw_knife',
    name: 'Throw Knife',
    image: THROW_KNIFE_IMAGE,
    cooldownTime: 2,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.3,
    abilityTimings: [
        { duration: 0.3, abilityPhase: AbilityPhase.Windup },
        { duration: 2, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    getTargets(): TargetDef[] {
        return this.targets;
    },
    aiSettings: { minRange: 0, maxRange: 200 },

    getTooltipText(_gameState?: unknown): string[] {
        return ['Throw a knife dealing {5} damage to the first enemy hit'];
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
                sourceAbilityId: 'throw_knife',
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

export const ThrowKnifeCard: CardDef = {
    id: asCardDefId('throw_knife'),
    name: 'Throw Knife',
    abilityId: 'throw_knife',
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
