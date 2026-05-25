import type { ScenarioDefinition } from '../../types';
import { asCardDefId } from '../../../card_defs';
import { EXPOSED_BUFF_TYPE } from '../../../buffs/ExposedBuff';
import { TRAINING_NODE_STRONG_PUNCH, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    seedHandWithAbilities,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { UnitTag } from '../../../game/units/unitTag';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';

const P = TINY_BATTLE_PLAYER_ID;
const CELL = 40;
const PLAYER_POS = { x: 3 * CELL + CELL / 2, y: 2 * CELL + CELL / 2 };
// Wolf is 50 px away — at punch max range (BASE_MAX_RANGE=30 + player radius=20).
const WOLF_POS = { x: PLAYER_POS.x + 50, y: PLAYER_POS.y };
// Second punch fires after the first ability cooldown (~96 ticks at 60 Hz).
const SECOND_PUNCH_TICK = 100;

/**
 * Alpha Wolf boss CC armor: one hit already absorbed before the scenario starts.
 * The player lands two Strong Punches in sequence:
 *   - Punch 1 (tick 0): consumed 1 → 2, absorbed (armor at threshold).
 *   - Punch 2 (tick 100): consumed 2 ≥ threshold → armor breaks → 5 s exposed.
 */
export const bossStunMechanicsScenario: ScenarioDefinition = {
    id: 'enemy_boss_stun_mechanics',
    title: 'Alpha Wolf boss: 2 Strong Punches break CC armor and expose for 5s',
    category: 'general',
    generalSection: 'Enemies',
    maxDurationMs: 6000,
    buildEngine() {
        const research = { [P]: { [TRAINING_TREE_ID]: [TRAINING_NODE_STRONG_PUNCH] } };
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 6,
            localPlayerId: P,
            grass: true,
            playerResearchTreesByPlayer: research,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: P,
            x: PLAYER_POS.x,
            y: PLAYER_POS.y,
            abilities: ['0102'],
            playerResearchTreesByPlayer: research,
        });

        const wolf = createUnitFromSpawnConfig(
            {
                id: 'alpha_wolf_boss',
                characterId: 'alpha_wolf',
                name: 'Beast',
                x: WOLF_POS.x,
                y: WOLF_POS.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [],
                unitTags: [UnitTag.Boss],
            },
            engine.eventBus,
        );
        // Alpha wolf has hardCcArmourFloor=2 (threshold=2) and ccArmourBreakStunDuration=5.
        // Pre-consume 1 hit so the two scenario punches fill and break the armor → exposed for 5 s.
        wolf.hardCcArmourConsumed = 1;
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf);

        seedHandWithAbilities(engine, P, [{ cardDefId: asCardDefId('0102'), abilityId: '0102' }]);

        // Queue second punch after first cooldown; pendingOrders keeps battle non-idle until it fires.
        engine.state.orderMgr.queueOrder(SECOND_PUNCH_TICK, {
            unitId: player.id,
            abilityId: '0102',
            targets: [{ type: 'pixel', position: WOLF_POS }],
        });

        return engine;
    },
    getInitialOrders(engine) {
        const u = engine.getLocalPlayerUnit()!;
        return [{ unitId: u.id, abilityId: '0102', targets: [{ type: 'pixel', position: WOLF_POS }] }];
    },
    assertPass(engine) {
        return Boolean(engine.getUnit('alpha_wolf_boss')?.hasBuff(EXPOSED_BUFF_TYPE));
    },
    failureMessage(engine) {
        const wolf = engine.getUnit('alpha_wolf_boss');
        const exposed = wolf?.buffs.find((b) => b._type === EXPOSED_BUFF_TYPE);
        return `exposed=${wolf?.hasBuff(EXPOSED_BUFF_TYPE)} duration=${exposed?.duration.value ?? '—'} consumed=${wolf?.hardCcArmourConsumed} hp=${wolf?.hp}`;
    },
};
