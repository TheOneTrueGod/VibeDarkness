/**
 * Unit components survive a mid-battle checkpoint: snapshot a live nest battle, restore it into a fresh engine, and
 * keep stepping both. The component slices (lanternite / swarm state and the nest spawner timers) must serialize
 * and restore well enough that the restored battle stays in lock-step with the original, tick by tick (unit
 * positions, hp, which units exist, and every component slice).
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { serializeUnit } from '../../../game/units/unitToJSON';
import type { ScenarioDefinition } from '../../types';
import { swarmlingSharedConstructionScenario } from './swarmlings';
import { lanterniteNestBuildScenario } from './lanternites';
import { TINY_BATTLE_PLAYER_ID } from '../../harness/buildTinyBattleEngine';

function unitSlices(engine: GameEngine): Record<string, unknown>[] {
    return engine.units
        .map((u) => serializeUnit(u, engine.gameTick))
        .map((j) => {
            const out: Record<string, unknown> = { id: j.id };
            for (const [k, v] of Object.entries(j)) {
                if (/^(lanternit|lantern[A-Z]|swarm|pet)/.test(k)) out[k] = v;
            }
            return out;
        })
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function battleSnapshot(engine: GameEngine): unknown {
    return {
        units: engine.units
            .map((u) => ({ id: u.id, characterId: u.characterId, x: u.x, y: u.y, hp: u.hp, active: u.active }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        slices: unitSlices(engine),
    };
}

function assertResumeMatches(scenario: ScenarioDefinition, warmupTicks: number, followTicks: number): void {
    const live = scenario.buildEngine();
    if (live instanceof Promise) throw new Error('async scenario build');
    for (const order of scenario.getInitialOrders(live)) live.state.orderMgr.applyOrder(order);
    live.stepSimulationFixedTicks(warmupTicks);

    const snap = JSON.parse(JSON.stringify(live.toJSON()));
    const restored = GameEngine.fromJSON(snap, TINY_BATTLE_PLAYER_ID, live.terrainManager);
    expect(unitSlices(restored)).toEqual(unitSlices(live));
    expect(unitSlices(live).some((u) => Object.keys(u).length > 1)).toBe(true);

    for (let i = 0; i < followTicks; i++) {
        live.stepSimulationFixedTicks(1);
        restored.stepSimulationFixedTicks(1);
        // The runtime fingerprint is a rolling hash that restarts on restore, so compare observable state instead.
        expect(battleSnapshot(restored)).toEqual(battleSnapshot(live));
    }
    expect(unitSlices(restored)).toEqual(unitSlices(live));
}

describe('unit components across a checkpoint', () => {
    it('swarm construction state restores and stays in lock-step', () => {
        assertResumeMatches(swarmlingSharedConstructionScenario, 120, 240);
    });

    it('lanternite scout construction state restores and stays in lock-step', () => {
        assertResumeMatches(lanterniteNestBuildScenario, 240, 240);
    });
});
