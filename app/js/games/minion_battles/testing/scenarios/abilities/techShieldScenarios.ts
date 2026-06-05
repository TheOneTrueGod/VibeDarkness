import type { ScenarioDefinition } from '../../types';
import {
    TECH_SHIELD_TREE_ID,
    TECH_SHIELD_NODE_BASE,
    TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
} from '../../../../../researchTrees/trees/tech_shield';
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
// Ally 40 px above player â€” within the 50 px on-block stamina-surge radius
const ALLY_POS = { x: PLAYER_POS.x, y: PLAYER_POS.y - 40 };

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

export const raiseShieldAllyStaminaSurgeScenario: ScenarioDefinition = {
    id: 'tech_shield_raise_shield_ally_stamina_surge',
    title: 'Raise Shield (0104): blocking grants 2 stamina surges to nearby ally',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const { engine } = buildShieldEngine('0104');
        const ally = createUnitFromSpawnConfig(
            {
                id: 'shield_ally',
                characterId: 'enemy_melee',
                name: 'Ally',
                hp: 200,
                x: ALLY_POS.x,
                y: ALLY_POS.y,
                teamId: 'player',
                ownerId: 'ai',
                abilities: ['0120'],
                unitAITreeId: 'static_test_no_ai',
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(ally);
        const punchRt = ally.abilityRuntime['0120'];
        if (punchRt) punchRt.currentUses = 0;
        engine.addUnit(ally, 'initialGameSpawn');
        return engine;
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
        const ally = engine.getUnit('shield_ally');
        const rt = ally?.abilityRuntime['0120'];
        return Boolean(rt && rt.currentUses >= 1);
    },
    failureMessage(engine) {
        const ally = engine.getUnit('shield_ally');
        const rt = ally?.abilityRuntime['0120'];
        return `ally bash uses=${rt?.currentUses ?? 0} (expected ≥1 from 2 stamina surges on block)`;
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
    title: 'Shining Block (0110) + Strengthening Light: blocking heals the defender',
    category: 'ability',
    maxDurationMs: 5000,
    buildEngine() {
        const research = {
            [P]: {
                [TECH_SHIELD_TREE_ID]: [
                    TECH_SHIELD_NODE_BASE,
                    'crystal_embedded_shield',
                    TECH_SHIELD_NODE_STRENGTHENING_LIGHT,
                ],
            },
        };
        const { engine, player } = buildShieldEngine('0110', research);
        player.hp -= 10;
        return engine;
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
        const player = engine.getLocalPlayerUnit();
        return Boolean(player && player.hp >= player.maxHp - 5);
    },
    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        return `player hp=${player?.hp} maxHp=${player?.maxHp} (expected heal to â‰¥maxHp-5 via Strengthening Light)`;
    },
};
