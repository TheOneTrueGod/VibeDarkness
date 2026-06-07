import type { GameEngine } from '../game/GameEngine';
import type { BattleOrder } from '../game/types';

/** Single headless scenario for ability or general engine behaviour. */
export interface ScenarioDefinition {
    id: string;
    title: string;
    category: 'ability' | 'general';
    /** When `category` is `general`, optional sidebar subsection (e.g. Movement). */
    generalSection?: string;
    /** Wall-clock budget converted to max fixed ticks at 60 Hz (default 5000 ms). */
    maxDurationMs?: number;
    /** Render a per-cell darkness overlay in test previews (use for scenarios that exercise the lighting system). */
    renderLighting?: boolean;
    buildEngine(): GameEngine | Promise<GameEngine>;
    getInitialOrders(engine: GameEngine): BattleOrder[];
    /**
     * When conditional cancel pauses the battle, run this instead of the default auto-wait resume.
     * Use for scenarios that pick a replacement Entombed ability or retarget the same one.
     */
    onConditionalCancelPause?: (engine: GameEngine) => void;
    assertPass(engine: GameEngine): boolean;
    failureMessage(engine: GameEngine): string;
    /** Optional human-readable snapshot for UI/debug. */
    describeState?(engine: GameEngine): string;
}
