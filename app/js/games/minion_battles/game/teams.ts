/**
 * Team system for the battle engine.
 *
 * Defines team IDs and alliance relationships. Extensible for
 * multiple enemy factions in the future.
 */

export type TeamId = 'player' | 'allied' | 'enemy';

/**
 * Alliance map: each team lists the other teams it considers allies.
 * A team is always allied with itself (checked separately).
 */
const ALLIANCE_MAP: Record<TeamId, TeamId[]> = {
    player: ['allied'],
    allied: ['player'],
    enemy: [],
};

/** Check whether two teams are allies (includes being the same team). */
export function areAllies(teamA: TeamId, teamB: TeamId): boolean {
    if (teamA === teamB) return true;
    return ALLIANCE_MAP[teamA]?.includes(teamB) ?? false;
}

/** Check whether two teams are enemies (not allied). */
export function areEnemies(teamA: TeamId, teamB: TeamId): boolean {
    return !areAllies(teamA, teamB);
}

/** Get all team IDs that are hostile to the given team. */
export function getHostileTeams(teamId: TeamId): TeamId[] {
    const allTeams: TeamId[] = ['player', 'allied', 'enemy'];
    return allTeams.filter((t) => areEnemies(teamId, t));
}

/** Get all team IDs that are allied with the given team (including itself). */
export function getAlliedTeams(teamId: TeamId): TeamId[] {
    const allTeams: TeamId[] = ['player', 'allied', 'enemy'];
    return allTeams.filter((t) => areAllies(teamId, t));
}
