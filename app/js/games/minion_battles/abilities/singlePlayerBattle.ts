/** True when the mission started with exactly one player character on the roster. */
export function isSinglePlayerBattle(
    battle: { enemyScalingPlayerCount?: number } | undefined | null,
): boolean {
    return (battle?.enemyScalingPlayerCount ?? 1) === 1;
}
