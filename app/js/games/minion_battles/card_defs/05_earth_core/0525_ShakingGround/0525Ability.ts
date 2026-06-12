import type { AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { type CardDef } from '../../types';
import { SHAKING_GROUND_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import type { EventBus } from '../../../game/EventBus';

const RADIUS = 100;
const DAMAGE = 10;
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.35, abilityPhase: AbilityPhase.Windup },
    { id: 'quake', start: 0.35, end: 0.45, abilityPhase: AbilityPhase.Active },
    { id: 'recover', start: 0.45, end: 1.5, abilityPhase: AbilityPhase.Cooldown },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    terrainManager?: {
        grid: { worldToGrid(x: number, y: number): { col: number; row: number } };
        damageRock(col: number, row: number, damage?: number, sourceUnitId?: string | null): unknown;
    } | null;
}

export const ShakingGroundAbility: AbilityStatic = {
    id: SHAKING_GROUND_ABILITY_ID,
    name: 'Shaking Ground',
    image: '',
    resourceCost: null,
    resourceCosts: [{ resourceId: 'resonance', amount: 25 }],
    rechargeTurns: 2,
    prefireTime: 0.35,
    abilityTimings: TIMINGS,
    targets: [],
    getTooltipText(): string[] {
        return ['Shake the ground in a {100} radius for {10} damage', 'Damages one stone tile under the caster'];
    },
    getAbilityStates(): [] {
        return [];
    },
    doCardEffect(engine: unknown, caster: Unit, _targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (!(prevTime < 0.35 && currentTime >= 0.35)) return;
        const eng = engine as EngineLike;
        damageEnemiesInCircle({
            engine: eng,
            caster,
            center: { x: caster.x, y: caster.y },
            radius: RADIUS,
            damage: DAMAGE,
            abilityId: SHAKING_GROUND_ABILITY_ID,
            attackType: 'melee',
        });
        if (!eng.terrainManager) return;
        const cell = eng.terrainManager.grid.worldToGrid(caster.x, caster.y);
        eng.terrainManager.damageRock(cell.col, cell.row, undefined, caster.id);
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
    ): void {
        gr.circle(caster.x, caster.y, RADIUS);
        gr.stroke({ width: 2, color: 0xc4b5fd, alpha: 0.9 });
    },
};

export const ShakingGroundCard: CardDef = {
    abilityId: SHAKING_GROUND_ABILITY_ID,
};
