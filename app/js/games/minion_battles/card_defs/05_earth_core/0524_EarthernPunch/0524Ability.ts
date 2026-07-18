import type { AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget } from '../../../game/types';
import type { TargetDef } from '../../../abilities/targeting';
import { type CardDef } from '../../types';
import { EARTHERN_PUNCH_ABILITY_ID } from '../../../abilities/earthCoreMeleePassives';
import { getPixelTargetPosition, getAimPointClampedToMaxRange } from '../../../abilities/targetHelpers';
import { ThickLineHitbox } from '../../../hitboxes';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { isOnStone } from '../../../abilities/earthCoreHelpers';
import { getEffectiveTerrain, type FloorTile } from '../../../terrain/FloorTile';
import type { EventBus } from '../../../game/EventBus';

const MAX_RANGE = 75;
const LINE_THICKNESS = 20;
const BASE_DAMAGE = 12;
const STONE_BONUS_DAMAGE = 4;
const TARGETS: TargetDef[] = [{ type: 'pixel', label: 'Punch direction' }];
const TIMINGS: AbilityTimingInterval[] = [
    { id: 'windup', start: 0, end: 0.2, abilityPhase: AbilityPhase.Windup },
    { id: 'hit', start: 0.2, end: 0.3, abilityPhase: AbilityPhase.Active, doNotRefund: true },
    { id: 'recover', start: 0.3, end: 1.1, abilityPhase: AbilityPhase.Cooldown },
];

interface EngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: EventBus;
    getUnit(id: string): Unit | undefined;
    terrainManager?: {
        grid: {
            worldToGrid(x: number, y: number): { col: number; row: number };
            get(col: number, row: number): number;
        };
        getFloorTile(col: number, row: number): FloorTile | null;
    } | null;
}

function isTargetStandingOnStone(engine: EngineLike, target: Unit): boolean {
    if (!engine.terrainManager) return false;
    const cell = engine.terrainManager.grid.worldToGrid(target.x, target.y);
    const floor = engine.terrainManager.getFloorTile(cell.col, cell.row);
    const effective = getEffectiveTerrain(floor, engine.terrainManager.grid.get(cell.col, cell.row));
    return isOnStone(effective, floor?.destructible);
}

export const EarthernPunchAbility: AbilityStatic = {
    id: EARTHERN_PUNCH_ABILITY_ID,
    name: 'Earthern Punch',
    image: '',
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: 0.2,
    abilityTimings: TIMINGS,
    targets: TARGETS,
    getTooltipText(): string[] {
        return ['Punch through enemies for {12} damage', 'Deal +{4} damage to targets standing on stone'];
    },
    getAbilityStates(): [] {
        return [];
    },
    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_RANGE + caster.radius };
    },
    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (!(prevTime < 0.2 && currentTime >= 0.2)) return;
        const eng = engine as EngineLike;
        const targetPos = getPixelTargetPosition(targets, 0);
        if (!targetPos) return;
        const clamped = getAimPointClampedToMaxRange(caster, targetPos, MAX_RANGE + caster.radius);
        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng,
            caster,
            caster.x,
            caster.y,
            clamped.x,
            clamped.y,
            LINE_THICKNESS,
        );
        for (const targetUnit of hitUnits) {
            let damage = BASE_DAMAGE;
            if (isTargetStandingOnStone(eng, targetUnit)) damage += STONE_BONUS_DAMAGE;
            tryDamageOrBlock(targetUnit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: EARTHERN_PUNCH_ABILITY_ID,
                damage,
                attackType: 'melee',
            });
        }
    },
    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {},
    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): void {
        const aim = getAimPointClampedToMaxRange(caster, mouseWorld, MAX_RANGE + caster.radius);
        ThickLineHitbox.renderTargetingPreview(gr, caster, aim, MAX_RANGE + caster.radius, LINE_THICKNESS);
    },
};

export const EarthernPunchCard: CardDef = {
    abilityId: EARTHERN_PUNCH_ABILITY_ID,
};
