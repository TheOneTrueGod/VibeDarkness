/**
 * Darkness Upgrades E2E scenario: Empowered Spirits.
 *
 * An enemy slime spawned with the Empowered Spirits bag has +12 max HP versus a
 * control slime spawned beforehand, and a single SlimeShot cast yields 3
 * projectiles (main + one wedge shot to each side).
 */

import type { ScenarioDefinition } from '../../types';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { PassiveStatKey } from '../../../../../researchTrees/types';
import { computeDarknessUpgradeBonuses } from '../../../../../researchTrees/darknessUpgrades';
import { DARKNESS_UPGRADES_TREE_ID, DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS } from '../../../../../researchTrees/trees/darkness_upgrades';
import { SlimeShotAbility } from '../../../card_defs/0001_SlimeShot/0001Ability';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const CONTROL_ID = 'du_control_slime';
const EMPOWERED_ID = 'du_empowered_slime';
const SLIME_POS = { x: 3 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
// Player is far enough that projectiles (range 200) are still in flight when checked.
const PLAYER_POS = { x: 9 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };

export const empoweredSpiritsScenario: ScenarioDefinition = {
    id: 'darkness_upgrade_empowered_spirits',
    title: 'Darkness Upgrades: Empowered Spirits gives slime +12 HP and a 3-projectile SlimeShot',
    category: 'general',
    generalSection: 'Darkness Upgrades',
    maxDurationMs: 3000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 14, gridH: 7, localPlayerId: P, grass: true });
        spawnTinyPlayerUnit(engine, { playerId: P, x: PLAYER_POS.x, y: PLAYER_POS.y, abilities: [] });

        // engine.spawnUnit is the path that bakes darkness-upgrade bonuses (createUnitFromSpawnConfig does not).
        const spawnSlime = (id: string, y: number) => {
            const [slime] = engine.spawnUnit({
                unitId: id,
                characterId: 'slime',
                teamId: 'enemy',
                abilities: ['0001'],
                unitAITreeId: 'static_test_no_ai',
                placement: { kind: 'fixedWorld', x: SLIME_POS.x, y },
            });
            initializeAbilityRuntimeForUnit(slime!);
            return slime!;
        };

        // Control spawns before the bag is active.
        spawnSlime(CONTROL_ID, 5 * CELL + CELL / 2);

        engine.darknessUpgradeBonuses = computeDarknessUpgradeBonuses({
            researchTrees: { [DARKNESS_UPGRADES_TREE_ID]: [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS] },
            researchNodeLevels: { [DARKNESS_UPGRADES_TREE_ID]: { [DARKNESS_UPGRADE_NODE_EMPOWERED_SPIRITS]: 1 } },
        });

        spawnSlime(EMPOWERED_ID, SLIME_POS.y);

        engine.state.orderMgr.queueOrder(1, {
            unitId: EMPOWERED_ID,
            abilityId: SlimeShotAbility.id,
            targets: [{ type: 'pixel', position: PLAYER_POS }],
        });
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const bonuses = engine.darknessUpgradeBonuses;
        if (bonuses[PassiveStatKey.EnemyUnitSlimeMaxHealthBonus]?.add !== 12) return false;
        const control = engine.getUnit(CONTROL_ID);
        const empowered = engine.getUnit(EMPOWERED_ID);
        if (!control || !empowered || empowered.maxHp !== control.maxHp + 12) return false;
        const shots = engine.projectiles.filter(
            (p) => p.sourceUnitId === EMPOWERED_ID && p.sourceAbilityId === SlimeShotAbility.id,
        );
        return shots.length === 3;
    },

    failureMessage(engine) {
        const control = engine.getUnit(CONTROL_ID);
        const empowered = engine.getUnit(EMPOWERED_ID);
        const shots = engine.projectiles.filter((p) => p.sourceUnitId === EMPOWERED_ID).length;
        return `control maxHp=${control?.maxHp} empowered maxHp=${empowered?.maxHp} projectiles=${shots}`;
    },
};
