import React, { useCallback, useEffect, useState } from 'react';
import DebugJsonBlock from '../DebugJsonBlock';

type JsonRecord = Record<string, unknown>;

interface DebugPlayerDataTabProps {
    isActive: boolean;
    fetchPlayerData: () => Promise<JsonRecord | null>;
}

export default function DebugPlayerDataTab({ isActive, fetchPlayerData }: DebugPlayerDataTabProps) {
    const [playerData, setPlayerData] = useState<JsonRecord | null>(null);
    const [playerDataLoading, setPlayerDataLoading] = useState(false);
    const [playerDataError, setPlayerDataError] = useState<string | null>(null);
    const [didAttempt, setDidAttempt] = useState(false);

    const loadPlayerData = useCallback(async () => {
        setPlayerDataLoading(true);
        setPlayerDataError(null);
        try {
            const data = await fetchPlayerData();
            setPlayerData(data ?? null);
        } catch (err) {
            setPlayerDataError(err instanceof Error ? err.message : 'Failed to load');
            setPlayerData(null);
        } finally {
            setPlayerDataLoading(false);
            setDidAttempt(true);
        }
    }, [fetchPlayerData]);

    useEffect(() => {
        if (!isActive) return;
        if (didAttempt) return;
        void loadPlayerData();
    }, [isActive, didAttempt, loadPlayerData]);

    if (!isActive) return null;

    return (
        <>
            {playerDataLoading && <p className="m-0 text-muted text-sm">Loading...</p>}
            {playerDataError && <p className="m-0 text-red-400 text-sm">{playerDataError}</p>}
            {!playerDataLoading && !playerDataError && (
                <DebugJsonBlock value={playerData} emptyText="No player data." />
            )}
        </>
    );
}

