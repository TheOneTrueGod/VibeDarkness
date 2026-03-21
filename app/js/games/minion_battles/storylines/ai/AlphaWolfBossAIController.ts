/**
 * AlphaWolfBossAIController - Boss AI for the alpha wolf in mission 004_monster.
 *
 * - Waits until a player unit gets within sightRadius (default 400) before acting.
 * - At start of each round: picks a prey (player unit) to focus.
 * - Moves towards prey; when within 40 uses Claw; when within 80 prefers Summon (1/round).
 */

import type { Unit } from '../../objects/Unit';
import type { UnitAIController, AIContext } from './types';
import {
    findEnemies,
    distance,
    getEnemiesInPerceptionAndLOS,
    applyAIMovementToUnit,
    buildResolvedTargets,
    queueWaitAndEndTurn,
} from './utils';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getPerceptionRange } from '../../engine/unitDef';

const CLAW_ABILITY_ID = '0004';
const SUMMON_ABILITY_ID = '0005';
const CLAW_RANGE = 40;
const SUMMON_PREFER_RANGE = 80;

function getSightRadius(unit: Unit): number {
    return (unit.aiContext?.sightRadius as number | undefined) ?? getPerceptionRange(unit.characterId);
}

function pickOrGetPrey(unit: Unit, context: AIContext): Unit | null {
    const enemies = findEnemies(unit, context.getUnits());
    if (enemies.length === 0) return null;

    const sightRadius = getSightRadius(unit);
    const inSight = getEnemiesInPerceptionAndLOS(
        unit,
        enemies,
        sightRadius,
        context.hasLineOfSight.bind(context),
    );
    if (inSight.length === 0) return null;

    const storedPreyId = unit.aiContext?.preyUnitId as string | undefined;
    const storedPrey = storedPreyId ? context.getUnit(storedPreyId) : null;
    if (storedPrey?.isAlive() && inSight.some((e) => e.id === storedPreyId)) {
        return storedPrey;
    }

    const prey = inSight[context.generateRandomInteger(0, inSight.length - 1)] ?? null;
    if (prey) {
        unit.aiContext = { ...unit.aiContext, preyUnitId: prey.id };
    }
    return prey;
}

export const AlphaWolfBossAIController: UnitAIController = {
    executeTurn(unit: Unit, context: AIContext): void {
        const enemies = findEnemies(unit, context.getUnits());
        const sightRadius = getSightRadius(unit);
        const inSight = getEnemiesInPerceptionAndLOS(
            unit,
            enemies,
            sightRadius,
            context.hasLineOfSight.bind(context),
        );

        if (inSight.length === 0) {
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const prey = pickOrGetPrey(unit, context);
        if (!prey?.isAlive()) {
            queueWaitAndEndTurn(unit, context);
            return;
        }

        const distToPrey = distance(unit.x, unit.y, prey.x, prey.y);

        const summonAbility = getAbility(SUMMON_ABILITY_ID);
        const clawAbility = getAbility(CLAW_ABILITY_ID);
        const summonUsesLeft =
            summonAbility?.aiSettings?.maxUsesPerRound != null && context.getAbilityUsesThisRound
                ? (summonAbility.aiSettings.maxUsesPerRound -
                      context.getAbilityUsesThisRound(unit.id, SUMMON_ABILITY_ID)) >
                  0
                : true;
        const clawUsesLeft =
            clawAbility?.aiSettings?.maxUsesPerRound != null && context.getAbilityUsesThisRound
                ? (clawAbility.aiSettings.maxUsesPerRound -
                      context.getAbilityUsesThisRound(unit.id, CLAW_ABILITY_ID)) >
                  0
                : true;

        if (distToPrey <= SUMMON_PREFER_RANGE && summonUsesLeft && summonAbility) {
            context.queueOrder(context.gameTick, {
                unitId: unit.id,
                abilityId: SUMMON_ABILITY_ID,
                targets: [],
                movePath: unit.pathInvalidated ? undefined : (unit.movement?.path ? [...unit.movement.path] : undefined),
            });
            context.emitTurnEnd(unit.id);
            return;
        }

        if (distToPrey <= CLAW_RANGE && clawUsesLeft && clawAbility) {
            const resolvedTargets = buildResolvedTargets(clawAbility, prey);
            context.queueOrder(context.gameTick, {
                unitId: unit.id,
                abilityId: CLAW_ABILITY_ID,
                targets: resolvedTargets,
                movePath: unit.pathInvalidated ? undefined : (unit.movement?.path ? [...unit.movement.path] : undefined),
            });
            context.emitTurnEnd(unit.id);
            return;
        }

        if (unit.aiSettings && context.terrainManager) {
            applyAIMovementToUnit(unit, prey, {
                findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                gameTick: context.gameTick,
                worldWidth: context.WORLD_WIDTH,
                worldHeight: context.WORLD_HEIGHT,
            });
        }
        queueWaitAndEndTurn(unit, context);
    },

    onPathfindingRetrigger(unit: Unit, context: AIContext): void {
        const prey = pickOrGetPrey(unit, context);
        if (!prey?.isAlive() || !unit.aiSettings || !context.terrainManager) return;
        applyAIMovementToUnit(unit, prey, {
            findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
            worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
            gameTick: context.gameTick,
            worldWidth: context.WORLD_WIDTH,
            worldHeight: context.WORLD_HEIGHT,
        });
    },
};
