/**
 * On-demand boss HUD banner for a unit: the same bold text the phase-transition banner uses, but shown by any engine
 * code (`showUnitBanner`) rather than only during a phase transition.
 *
 * Display only: it never changes game state. The call emits `unit_banner` (a deterministic engine event, so tests and
 * other listeners can see it) and remembers the banner until `gameTime + seconds` so the HUD, which polls rather than
 * listens, can read it with `getActiveUnitBanner`. Times are world seconds (`engine.gameTime`). The record is not
 * serialized: a banner is a one-second flourish, not state.
 */
import type { GameEngine } from './GameEngine';

interface ActiveBanner {
    text: string;
    until: number;
}

const banners = new WeakMap<GameEngine, Map<string, ActiveBanner>>();

/** Show `text` as the banner for `unitId` for `seconds` of world time; replaces any banner it already has. */
export function showUnitBanner(engine: GameEngine, unitId: string, text: string, seconds: number): void {
    let byUnit = banners.get(engine);
    if (!byUnit) {
        byUnit = new Map();
        banners.set(engine, byUnit);
    }
    byUnit.set(unitId, { text, until: engine.gameTime + seconds });
    engine.eventBus.emit('unit_banner', { unitId, text, durationSec: seconds });
}

/** The banner text `unitId` is showing now, or null. */
export function getActiveUnitBanner(engine: GameEngine, unitId: string): string | null {
    const byUnit = banners.get(engine);
    const banner = byUnit?.get(unitId);
    if (!banner) return null;
    if (engine.gameTime >= banner.until) {
        byUnit!.delete(unitId);
        return null;
    }
    return banner.text;
}
