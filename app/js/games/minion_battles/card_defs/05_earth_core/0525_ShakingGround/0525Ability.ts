import type { AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';
import { SHAKING_GROUND_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import type { EventBus } from '../../../game/EventBus';

const RADIUS = 100;
const DAMAGE = 10;
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.35, abilityPhase: AbilityPhase.Windup },
    { id: 'quake', start: 0.35, end: 0.55, abilityPhase: AbilityPhase.Active },
    { id: 'recover', start: 0.55, end: 1.5, abilityPhase: AbilityPhase.Cooldown },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    terrainManager?: {
        grid: { worldToGrid(x: number, y: number): { col: number; row: number } };
        damageRock(col: number, row: number): unknown;
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
        for (const unit of eng.units) {
            if (unit.id === caster.id) continue;
            const dx = unit.x - caster.x;
            const dy = unit.y - caster.y;
            if ((dx * dx) + (dy * dy) > (RADIUS * RADIUS)) continue;
            tryDamageOrBlock(unit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: SHAKING_GROUND_ABILITY_ID,
                damage: DAMAGE,
                attackType: 'melee',
            });
        }
        if (!eng.terrainManager) return;
        const cell = eng.terrainManager.grid.worldToGrid(caster.x, caster.y);
        eng.terrainManager.damageRock(cell.col, cell.row);
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
    id: asCardDefId(SHAKING_GROUND_ABILITY_ID),
    name: 'Shaking Ground',
    abilityId: SHAKING_GROUND_ABILITY_ID,
    discardDuration: { duration: 2, unit: 'rounds' },
};
