import { useState, useEffect, useRef, useCallback } from 'react';
import type { LobbyState, PlayerState } from '../types';

/** Ping-flash state: which players' cards are flashing, and the trigger that schedules the flashes. */
export function usePlayerFlash(currentLobby: LobbyState | null, currentPlayer: PlayerState | null) {
    // Track which players should currently have flashing cards due to WebRTC pings
    const [flashingPlayerIds, setFlashingPlayerIds] = useState<string[]>([]);
    const flashTimersRef = useRef<Record<string, number[]>>({});

    const triggerPlayerFlash = useCallback((playerId: string) => {
        setFlashingPlayerIds((prev) => {
            if (prev.includes(playerId)) {
                return prev;
            }
            return [...prev, playerId];
        });

        const clearExistingTimers = () => {
            const timers = flashTimersRef.current[playerId] ?? [];
            for (const id of timers) {
                clearTimeout(id);
            }
            flashTimersRef.current[playerId] = [];
        };

        clearExistingTimers();

        const schedule = (delayMs: number, shouldFlash: boolean) => {
            const id = window.setTimeout(() => {
                setFlashingPlayerIds((prev) => {
                    const exists = prev.includes(playerId);
                    if (shouldFlash) {
                        if (exists) return prev;
                        return [...prev, playerId];
                    }
                    if (!exists) return prev;
                    return prev.filter((p) => p !== playerId);
                });
            }, delayMs);
            flashTimersRef.current[playerId] = [...(flashTimersRef.current[playerId] ?? []), id];
        };

        schedule(0, true);
        schedule(1000, false);
        schedule(2000, true);
        schedule(3000, false);
    }, []);

    // Clear ping flashes when leaving the lobby (mesh teardown used to do this).
    useEffect(() => {
        if (!currentLobby || !currentPlayer) {
            setFlashingPlayerIds([]);
        }
    }, [currentLobby, currentPlayer]);

    return { flashingPlayerIds, triggerPlayerFlash };
}
