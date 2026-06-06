import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import type { ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { getDirectionFromTo, getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { Projectile } from '../../../game/projectiles/Projectile';
import { type CardDef } from '../../types';

const ABILITY_ID = '0531';
const RANGE = 220;
const DAMAGE = 6;
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.25, abilityPhase: AbilityPhase.Windup },
    { id: 'active', start: 0.25, end: 0.9, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: 0.9, end: 1.3, abilityPhase: AbilityPhase.Cooldown },
];

const KNOCK_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="5" width="30" height="30" rx="6" fill="#5a5a5a"/>
  <path d="M10 20 L30 20 M24 14 L30 20 L24 26" stroke="#d9d9d9" stroke-width="3" fill="none"/>
</svg>`;

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
}

export const KnockAbility: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Knock',
    image: KNOCK_IMAGE,
    resourceCost: null, // TODO: Earth Core resonance cost pending balance pass.
    rechargeTurns: 1,
    prefireTime: 0.25,
    abilityTimings: TIMINGS,
    targets: [{ type: 'pixel', label: 'Target location' }],
    aiSettings: { minRange: 0, maxRange: RANGE },
    getTooltipText(): string[] {
        return ['Fire a Stonephase projectile for {6} damage.'];
    },
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.25 || currentTime < 0.25) return;
        const target = getPixelTargetPosition(targets, 0);
        if (!target) return;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
        if (dist <= 0) return;
        const projectile = new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dirX * 950,
            velocityY: dirY * 950,
            damage: DAMAGE,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: ABILITY_ID,
            maxDistance: Math.min(RANGE, dist),
            modifiers: ['stonephase'],
        });
        (engine as GameEngineLike).addProjectile(projectile);
    },
    getAbilityStates(): [] {
        return [];
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        if (attackInfo.type === 'projectile' && attackInfo.projectile) {
            (attackInfo.projectile as Projectile).active = false;
        }
    },
};

export const KnockCard: CardDef = {
    abilityId: ABILITY_ID,
};
