import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { areEnemies } from '../../../game/teams';
import type { EventBus } from '../../../game/EventBus';
import { getEarthCoreArmour, spendAllEarthCoreArmour } from '../0527_EarthCoreShared/earthCoreArmour';
import { type CardDef } from '../../types';

const ABILITY_ID = '0533';
const BASE_DAMAGE = 4;
const BONUS_DAMAGE_PER_ARMOUR = 2;
const MAX_RANGE = 75;
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.22, abilityPhase: AbilityPhase.Windup },
    { id: 'active', start: 0.22, end: 0.35, abilityPhase: AbilityPhase.Active },
    { id: 'cooldown', start: 0.35, end: 0.8, abilityPhase: AbilityPhase.Cooldown },
];

const STONEY_PUNCH_IMAGE = `<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="8" width="24" height="24" rx="6" fill="#6b6b6b"/>
  <path d="M12 23 L16 14 L20 22 L24 13 L28 23" stroke="#e5e7eb" stroke-width="2" fill="none"/>
</svg>`;

interface GameEngineLike {
    eventBus: EventBus;
    getUnit(id: string): Unit | undefined;
}

export const StoneyPunch: AbilityStatic = {
    id: ABILITY_ID,
    name: 'Stoney Punch',
    image: STONEY_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.22,
    abilityTimings: TIMINGS,
    targets: [{ type: 'unit', label: 'Melee target' }],
    aiSettings: { minRange: 0, maxRange: MAX_RANGE },
    getTooltipText(): string[] {
        return ['Melee burst. Consumes all armour, adding {2} damage per armour consumed.'];
    },
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= 0.22 || currentTime < 0.22) return;
        const eng = engine as GameEngineLike;
        const targetRef = targets[0];
        const target = targetRef?.type === 'unit' && targetRef.unitId ? eng.getUnit(targetRef.unitId) : undefined;
        if (!target || !target.isAlive() || !areEnemies(caster.teamId, target.teamId)) return;
        const distance = Math.hypot(target.x - caster.x, target.y - caster.y);
        if (distance > MAX_RANGE + target.radius) return;
        const spentArmour = spendAllEarthCoreArmour(caster);
        const damage = BASE_DAMAGE + (spentArmour * BONUS_DAMAGE_PER_ARMOUR);
        target.takeDamage(damage, caster.id, eng.eventBus);
    },
    getAbilityStates(): [] {
        return [];
    },
};

export const StoneyPunchCard: CardDef = {
    abilityId: ABILITY_ID,
};

export function getStoneyPunchPreviewDamage(caster: Unit): number {
    return BASE_DAMAGE + (getEarthCoreArmour(caster) * BONUS_DAMAGE_PER_ARMOUR);
}
