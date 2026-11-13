/**
 * Live-battle side of tutorial unit filters: turns engine units into `TutorialUnitView`s and finds the unit a
 * trigger or pointer means. Read-only; tutorials never touch the simulation.
 */
import type { Camera } from '../game/Camera';
import type { GameEngine } from '../game/GameEngine';
import type { Unit } from '../game/units/Unit';
import { areEnemies, type TeamId } from '../game/teams';
import { getUnitDetection, isDetectionVisible } from '../game/visibility/teamPerception';
import { shouldShowJuggernautRing } from '../game/GameRenderer/renderers/juggernautRing';
import { unitMatchesTutorialFilter, type TutorialUnitView } from './tutorialLogic';
import type { TutorialUnitFilter } from './tutorialTypes';

/** Team the local player is on (their unit's, else the player team). */
function localTeamOf(engine: GameEngine): TeamId {
    return engine.getLocalPlayerUnit()?.teamId ?? 'player';
}

export function tutorialUnitView(unit: Unit, localTeamId: TeamId, gameTime: number): TutorialUnitView {
    const hostile = areEnemies(localTeamId, unit.teamId);
    return {
        characterId: unit.characterId,
        stackSize: unit.stackSize,
        hostile,
        // The same condition the renderer draws the juggernaut border on.
        inJuggernautWindow: shouldShowJuggernautRing(unit, gameTime, hostile),
    };
}

/**
 * Whether the player can see the unit now: its centre is inside the camera's viewport and, for an enemy, the
 * local team sees or glimpses it (`getUnitDetection` + `isDetectionVisible`, the same rule `UnitRenderer`
 * uses). Heard, felt and hidden enemies do not count.
 */
export function isUnitOnScreen(unit: Unit, camera: Camera, engine: GameEngine, localTeamId: TeamId): boolean {
    const s = camera.worldToScreen(unit.x, unit.y);
    if (s.x < 0 || s.y < 0 || s.x > camera.viewportWidth || s.y > camera.viewportHeight) return false;
    if (!areEnemies(localTeamId, unit.teamId)) return true;
    return isDetectionVisible(getUnitDetection(engine, localTeamId, unit));
}

/** Views of the living units the player can see on screen now. */
export function tutorialUnitsOnScreen(engine: GameEngine, camera: Camera): TutorialUnitView[] {
    const localTeamId = localTeamOf(engine);
    return engine.units
        .filter((u) => u.isAlive() && isUnitOnScreen(u, camera, engine, localTeamId))
        .map((u) => tutorialUnitView(u, localTeamId, engine.gameTime));
}

/**
 * The living unit matching `filter` nearest the local player's unit, preferring units on screen when a
 * camera is given.
 */
export function findTutorialUnit(engine: GameEngine, filter: TutorialUnitFilter, camera?: Camera): Unit | undefined {
    const localTeamId = localTeamOf(engine);
    const matches = engine.units.filter(
        (u) => u.isAlive() && unitMatchesTutorialFilter(tutorialUnitView(u, localTeamId, engine.gameTime), filter),
    );
    const onScreen = camera ? matches.filter((u) => isUnitOnScreen(u, camera, engine, localTeamId)) : [];
    const pool = onScreen.length > 0 ? onScreen : matches;
    const from = engine.getLocalPlayerUnit();
    if (!from) return pool[0];
    let best: Unit | undefined;
    let bestDistSq = Infinity;
    for (const u of pool) {
        const distSq = (u.x - from.x) ** 2 + (u.y - from.y) ** 2;
        if (distSq < bestDistSq) {
            bestDistSq = distSq;
            best = u;
        }
    }
    return best;
}
