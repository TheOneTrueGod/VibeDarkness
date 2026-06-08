import type { AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import type { TargetDef } from '../../../abilities/targeting';
import { type CardDef } from '../../types';
import { SHATTER_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { getEarthCoreArmour } from '../../../abilities/earthCoreArmour';
import { getPixelTargetPosition } from '../../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import type { EventBus } from '../../../game/EventBus';

const RANGE = 180;
const BASE_DAMAGE = 6;
const ARMOUR_TO_DAMAGE_RATIO = 2;
const STONE_CONSUME_RADIUS = 1.5;
const TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Shatter target' }];
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.25, abilityPhase: AbilityPhase.Windup },
    { id: 'burst', start: 0.25, end: 0.35, abilityPhase: AbilityPhase.Active },
    { id: 'recover', start: 0.35, end: 1.2, abilityPhase: AbilityPhase.Cooldown },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    getUnit(id: string): Unit | undefined;
    terrainManager?: {
        grid: { worldToGrid(x: number, y: number): { col: number; row: number } };
        consumeRockInRadius(centerCol: number, centerRow: number, radius: number, sourceUnitId?: string | null): unknown;
    } | null;
}

function resolveNearestEnemy(engine: EngineLike, caster: Unit, targetPos: { x: number; y: number }): Unit | undefined {
    let best: Unit | undefined;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const unit of engine.units) {
        if (unit.id === caster.id) continue;
        if (unit.teamId === caster.teamId) continue;
        const dx = unit.x - targetPos.x;
        const dy = unit.y - targetPos.y;
        const distSq = (dx * dx) + (dy * dy);
        if (distSq < bestDistSq) {
            best = unit;
            bestDistSq = distSq;
        }
    }
    return best;
}

export const ShatterAbility: AbilityStatic = {
    id: SHATTER_ABILITY_ID,
    name: 'Shatter',
    image: '',
    resourceCost: null,
    resourceCosts: [{ resourceId: 'resonance', amount: 35 }],
    rechargeTurns: 2,
    prefireTime: 0.25,
    abilityTimings: TIMINGS,
    targets: TARGETS,
    getTooltipText(): string[] {
        return ['Shatter a target for {6} + 2x current armour damage', 'Consumes one nearby stone at the target'];
    },
    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: RANGE + caster.radius };
    },
    getAbilityStates(): [] {
        return [];
    },
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (!(prevTime <= 0.25 && currentTime >= 0.25)) return;
        const eng = engine as EngineLike;
        const targetPos = getPixelTargetPosition(targets, 0);
        if (!targetPos) return;
        const targetUnit = resolveNearestEnemy(eng, caster, targetPos);
        if (!targetUnit) return;

        const armourBonus = getEarthCoreArmour(caster) * ARMOUR_TO_DAMAGE_RATIO;
        tryDamageOrBlock(targetUnit, {
            engine: eng,
            gameTime: eng.gameTime,
            eventBus: eng.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId: SHATTER_ABILITY_ID,
            damage: BASE_DAMAGE + armourBonus,
            attackType: 'melee',
        });

        if (!eng.terrainManager) return;
        const cell = eng.terrainManager.grid.worldToGrid(targetUnit.x, targetUnit.y);
        eng.terrainManager.consumeRockInRadius(cell.col, cell.row, STONE_CONSUME_RADIUS, caster.id);
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        _caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        gr.circle(mouseWorld.x, mouseWorld.y, 30);
        gr.stroke({ width: 2, color: 0xf59e0b, alpha: 1 });
    },
};

export const ShatterCard: CardDef = {
    abilityId: SHATTER_ABILITY_ID,
};
