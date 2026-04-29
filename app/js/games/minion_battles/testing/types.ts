import type { GameEngine } from '../game/GameEngine';
import type { BattleOrder } from '../game/types';

/** Single headless scenario for ability or general engine behaviour. */
export interface ScenarioDefinition {
    id: string;
    title: string;
    category: 'ability' | 'general';
    /** Wall-clock budget converted to max fixed ticks at 60 Hz (default 5000 ms). */
    maxDurationMs?: number;
    buildEngine(): GameEngine | Promise<GameEngine>;
    getInitialOrders(engine: GameEngine): BattleOrder[];
    assertPass(engine: GameEngine): boolean;
    failureMessage(engine: GameEngine): string;
    /** Optional human-readable snapshot for UI/debug. */
    describeState?(engine: GameEngine): string;
}
