import { describe, expect, it } from 'vitest';
import '../../../abilities/AbilityRegistry';
import { buildTinyBattleEngine, spawnTinyPlayerUnit } from '../../../testing/harness/buildTinyBattleEngine';
import {
	EARTH_NODE_DIGGING_CLAWS,
	EARTH_NODE_EARTH_ATTUNED,
	EARTH_NODE_EARTH_CORE,
	EARTH_TREE_ID,
} from '../../../../../researchTrees/trees/earth';

const P = 'p1';
const CARD_ID = '0534';

/** Spawns a Digging Claws player with no uses left; the engine's first tick applies round-1 start recovery. */
function usesAfterRoundStart(nodes: string[]): number {
	const research = { [P]: { [EARTH_TREE_ID]: nodes } };
	const engine = buildTinyBattleEngine({ gridW: 10, gridH: 10, localPlayerId: P, playerResearchTreesByPlayer: research });
	const player = spawnTinyPlayerUnit(engine, {
		playerId: P, x: 100, y: 100, abilities: [CARD_ID],
		playerResearchTreesByPlayer: research, applyResearchAbilityModifiers: true,
	});
	player.abilityRuntime[CARD_ID]!.currentUses = 0;
	engine.stepSimulationFixedTicks(1);
	return player.abilityRuntime[CARD_ID]!.currentUses;
}

describe('Digging Claws round-start recovery (engine)', () => {
	it('recovers 2 uses at round start without research', () => {
		expect(usesAfterRoundStart([EARTH_NODE_EARTH_CORE, EARTH_NODE_DIGGING_CLAWS])).toBe(2);
	});

	it('recovers 3 uses at round start with one rank of Earth Attuned', () => {
		expect(usesAfterRoundStart([EARTH_NODE_EARTH_CORE, EARTH_NODE_DIGGING_CLAWS, EARTH_NODE_EARTH_ATTUNED])).toBe(3);
	});
});
