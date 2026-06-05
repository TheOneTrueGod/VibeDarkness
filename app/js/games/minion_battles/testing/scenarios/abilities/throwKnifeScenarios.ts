import type { ScenarioDefinition } from '../../types';
import { asCardDefId } from '../../../card_defs';
import {
    buildTinyBattleEngine,
    seedHandWithAbilities,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
    MOVE_ONLY_ABILITY_ID,
} from '../../harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../../fixtures/targetDummies';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import {
    CRYSTAL_ROCKS_TREE_ID,
    CRYSTAL_ROCKS_NODE_PIERCING_KNIVES,
} from '../../../../../researchTrees/trees/crystal_rocks';
import { BLEED_BUFF_TYPE } from '../../../buffs/BleedBuff';

const P = TINY_BATTLE_PLAYER_ID;

const PIERCE_RESEARCH = ['throwing_knives', CRYSTAL_ROCKS_NODE_PIERCING_KNIVES];

/**
 * Caster at (80, 200). Knife aimed right at pixel (600, 200) — travelDistance = 200px.
 * dummy_front at (200, 200): 120px from caster, hit first.
 * dummy_back  at (280, 200): 200px from caster (max range), hit after pierce.
 * Both receive 5 bleed stacks on hit. Phase 2 waits ~half a round for bleed ticks.
 */
let bleedState = { hitHp0: -1, hitHp1: -1, hitTime: -1 };

export const throwKnifePiercingBleedScenario: ScenarioDefinition = {
    id: 'throw_knife_piercing_bleed',
    title: 'Throw Knife with piercing_knives pierces the first target and bleeds both',
    category: 'ability',
    maxDurationMs: 8000,

    buildEngine() {
        bleedState = { hitHp0: -1, hitHp1: -1, hitTime: -1 };
        const research = { [P]: { [CRYSTAL_ROCKS_TREE_ID]: PIERCE_RESEARCH } };
        const engine = buildTinyBattleEngine({
            gridW: 12,
            gridH: 8,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });
        spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: 80,
            y: 200,
            abilities: ['throw_knife'],
            playerResearchTreesByPlayer: research,
        });
        const front = createTargetDummyAtWorld(engine, 200, 200, { id: 'knife_dummy_front', hp: 100 });
        initializeAbilityRuntimeForUnit(front);
        engine.addUnit(front, 'initialGameSpawn');
        const back = createTargetDummyAtWorld(engine, 280, 200, { id: 'knife_dummy_back', hp: 100 });
        initializeAbilityRuntimeForUnit(back);
        engine.addUnit(back, 'initialGameSpawn');
        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('throw_knife'), abilityId: 'throw_knife' }]);
        return engine;
    },

    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        // Build a long zigzag to keep the engine alive through several bleed ticks.
        // Player starts at cell (2, 5). Walk up to row 0, then zigzag across row 0.
        const path: { col: number; row: number }[] = [];
        for (let r = 5; r >= 0; r--) path.push({ col: 2, row: r });
        for (let c = 2; c <= 11; c++) path.push({ col: c, row: 0 });
        for (let c = 11; c >= 0; c--) path.push({ col: c, row: 0 });
        for (let c = 0; c <= 11; c++) path.push({ col: c, row: 0 });

        return [
            {
                unitId: u.id,
                abilityId: 'throw_knife',
                targets: [{ type: 'pixel' as const, position: { x: 600, y: 200 } }],
            },
            {
                unitId: u.id,
                abilityId: MOVE_ONLY_ABILITY_ID,
                targets: [],
                movePath: path,
            },
        ];
    },

    assertPass(engine) {
        const d0 = engine.getUnit('knife_dummy_front');
        const d1 = engine.getUnit('knife_dummy_back');
        if (!d0 || !d1) return false;

        // Phase 1: both hit by the knife and both have bleed applied
        if (bleedState.hitHp0 < 0) {
            if (d0.hp >= d0.maxHp || d1.hp >= d1.maxHp) return false;
            if (!d0.hasBuff(BLEED_BUFF_TYPE) || !d1.hasBuff(BLEED_BUFF_TYPE)) return false;
            bleedState.hitHp0 = d0.hp;
            bleedState.hitHp1 = d1.hp;
            bleedState.hitTime = engine.gameTime;
            return false;
        }

        // Phase 2: after ~half a round, hp is lower than right after the hit (bleed ticked)
        if (engine.gameTime < bleedState.hitTime + 4) return false;
        return d0.hp < bleedState.hitHp0 && d1.hp < bleedState.hitHp1;
    },

    failureMessage(engine) {
        const d0 = engine.getUnit('knife_dummy_front');
        const d1 = engine.getUnit('knife_dummy_back');
        const f0 = d0
            ? `hp=${d0.hp}/${d0.maxHp} bleed=${d0.hasBuff(BLEED_BUFF_TYPE)}`
            : 'missing';
        const f1 = d1
            ? `hp=${d1.hp}/${d1.maxHp} bleed=${d1.hasBuff(BLEED_BUFF_TYPE)}`
            : 'missing';
        return `front=[${f0}] back=[${f1}] snapshot=[${bleedState.hitHp0},${bleedState.hitHp1}] hitTime=${bleedState.hitTime.toFixed(2)} gameTime=${engine.gameTime.toFixed(2)}`;
    },
};
