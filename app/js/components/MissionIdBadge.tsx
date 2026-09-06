/**
 * Header pill for the current mission id. Admin or open debug console only.
 */
import React from 'react';
import { useCurrentUser } from '../user/useCurrentUser';
import { useDebugConsole } from '../contexts/DebugConsoleContext';
import { TestIds } from '../testing/testIds';

interface MissionIdBadgeProps {
    missionId?: string | null;
    className?: string;
}

export default function MissionIdBadge({ missionId, className = '' }: MissionIdBadgeProps) {
    const { isAdmin } = useCurrentUser();
    const { debugConsoleEnabled } = useDebugConsole();
    if (!missionId || !(isAdmin || debugConsoleEnabled)) return null;

    return (
        <span
            data-testid={TestIds.headerMissionId}
            title="Mission ID"
            className={`px-2 py-1 bg-surface-light rounded font-mono text-xs sm:text-sm shrink-0 ${className}`}
        >
            {missionId}
        </span>
    );
}

/** Read selected mission id from lobby game JSON (camel or snake). */
export function selectedMissionIdFromGameData(
    gameData: Record<string, unknown> | null | undefined,
): string | undefined {
    if (!gameData) return undefined;
    const raw = gameData.selectedMissionId ?? gameData.selected_mission_id;
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}
