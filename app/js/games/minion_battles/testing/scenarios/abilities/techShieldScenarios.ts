import type { ScenarioDefinition } from '../../types';
import {
    WEAPONS_TREE_ID,
    CRYSTAL_SHIELD_ROOT_NODE_ID,
    NODE_STRENGTHENING_LIGHT,
} from '../../../../../researchTrees/trees/weaponTreeIds';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 4 * CELL + CELL / 2, y: 3 * CELL + CELL / 2 };
// Attacker 30 px to the right — within 0120 Bash range (MAX_RANGE=30 + attacker radius)
const ATTACKER_POS = { x: PLAYER_POS.x + 30, y: PLAYER_POS.y };

function buildShieldEngine(
    abilityId: string,
    research?: Record<string, Record<string, string[]>>,
): { engine: ReturnType<typeof buildTinyBattleEngine>; player: ReturnType<typeof spawnTinyPlayerUnit> } {
    const engine = buildTinyBattleEngine({
        gridW: 10,
        gridH: 8,
        localPlayerId: P,
        grass: true,
        playerResearchTreesByPlayer: research,
    });
    const player = spawnTinyPlayerUnit(engine, {
        playerId: P,
        x: PLAYER_POS.x,
        y: PLAYER_POS.y,
        abilities: [abilityId],
    });
    const attacker = createUnitFromSpawnConfig(
        {
            id: 'attacker',
            characterId: 'alpha_wolf',
            name: 'Attacker',
            x: ATTACKER_POS.x,
            y: ATTACKER_POS.y,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: ['0120'],
        },
        engine.eventBus,
    );
    initializeAbilityRuntimeForUnit(attacker);
    engine.addUnit(attacker, 'initialGameSpawn');
    return { engine, player };
}

export const raiseShieldBlocksScenario: ScenarioDefinition = {
    id: 'tech_shield_raise_shield_blocks',
    title: 'Raise Shield (0104): blocking prevents all damage',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        return buildShieldEngine('0104').engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const attacker = engine.getUnit('attacker')!;
        return [
            { unitId: player.id, abilityId: '0104', targets: [{ type: 'pixel' as const, position: ATTACKER_POS }] },
            { unitId: attacker.id, abilityId: '0120', targets: [{ type: 'pixel' as const, position: PLAYER_POS }] },
        ];
    },
    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        return Boolean(player && player.hp === player.maxHp);
    },
    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        return `player hp=${player?.hp} maxHp=${player?.maxHp} (expected no damage taken)`;
    },
};

export const shiningBlockRetaliationScenario: ScenarioDefinition = {
    id: 'tech_shield_shining_block_retaliation',
    title: 'Shining Block (0110): blocking deals retaliation damage to attacker',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        return buildShieldEngine('0110').engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const attacker = engine.getUnit('attacker')!;
        return [
            { unitId: player.id, abilityId: '0110', targets: [{ type: 'pixel' as const, position: ATTACKER_POS }] },
            { unitId: attacker.id, abilityId: '0120', targets: [{ type: 'pixel' as const, position: PLAYER_POS }] },
        ];
    },
    assertPass(engine) {
        const attacker = engine.getUnit('attacker');
        return Boolean(attacker && attacker.hp < attacker.maxHp);
    },
    failureMessage(engine) {
        const attacker = engine.getUnit('attacker');
        return `attacker hp=${attacker?.hp} maxHp=${attacker?.maxHp} (expected retaliation damage on block)`;
    },
};

export const shiningBlockStrengtheningLightScenario: ScenarioDefinition = {
    id: 'tech_shield_shining_block_strengthening_light',
    title: 'Shining Block (0110) + Strengthening Light research: retaliation still fires',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const research = {
            [P]: {
                [WEAPONS_TREE_ID]: [CRYSTAL_SHIELD_ROOT_NODE_ID, NODE_STRENGTHENING_LIGHT],
            },
        };
        return buildShieldEngine('0110', research).engine;
    },
    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        const attacker = engine.getUnit('attacker')!;
        return [
            { unitId: player.id, abilityId: '0110', targets: [{ type: 'pixel' as const, position: ATTACKER_POS }] },
            { unitId: attacker.id, abilityId: '0120', targets: [{ type: 'pixel' as const, position: PLAYER_POS }] },
        ];
    },
    assertPass(engine) {
        const attacker = engine.getUnit('attacker');
        return Boolean(attacker && attacker.hp < attacker.maxHp);
    },
    failureMessage(engine) {
        const attacker = engine.getUnit('attacker');
        return `attacker hp=${attacker?.hp} maxHp=${attacker?.maxHp} (expected retaliation damage on block with Strengthening Light research active)`;
    },
};
