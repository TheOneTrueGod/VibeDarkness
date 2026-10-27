/**
 * One-shot "skip the Ready screen" hand-off: set when a victory Continue moves the player into the
 * next mission lobby, consumed by the Prepare screen, which readies a single-player game on its own.
 */
let pendingAutoReadyLobbyId: string | null = null;

export function markLobbyForAutoReady(lobbyId: string): void {
    pendingAutoReadyLobbyId = lobbyId;
}

export function isLobbyMarkedForAutoReady(lobbyId: string): boolean {
    return lobbyId !== '' && pendingAutoReadyLobbyId === lobbyId;
}

/** Clears the mark (call once the Ready has been sent, or when the lobby turned out to be multiplayer). */
export function clearAutoReadyLobby(): void {
    pendingAutoReadyLobbyId = null;
}
