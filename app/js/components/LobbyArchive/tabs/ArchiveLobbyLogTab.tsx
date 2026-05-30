import React, { useEffect, useState } from 'react';
import type { LobbyClient } from '../../../LobbyClient';

interface ArchiveLobbyLogTabProps {
    isActive: boolean;
    lobbyId: string;
    lobbyClient: LobbyClient;
    logCleared: boolean;
}

interface LogLine {
    severity?: string;
    tick?: number | null;
    message?: string;
    context?: unknown;
    logType?: string;
    playerId?: string;
    gameId?: string;
    [key: string]: unknown;
}

const SEVERITY_COLORS: Record<string, string> = {
    critical: 'text-red-400',
    error: 'text-red-300',
    warn: 'text-yellow-300',
    info: 'text-blue-300',
    log: 'text-muted',
};

export default function ArchiveLobbyLogTab({
    isActive,
    lobbyId,
    lobbyClient,
    logCleared,
}: ArchiveLobbyLogTabProps) {
    const [lines, setLines] = useState<LogLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        lobbyClient
            .getAdminLobbyLog(lobbyId)
            .then((raw) => {
                if (!cancelled) setLines(raw as LogLine[]);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load log');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isActive, lobbyId, lobbyClient, logCleared]);

    if (!isActive) return null;
    if (loading) return <div className="text-muted text-sm">Loading…</div>;
    if (error) return <div className="text-danger text-sm">{error}</div>;
    if (lines.length === 0) return <div className="text-muted text-sm">No log entries.</div>;

    return (
        <div className="space-y-1 font-mono text-xs">
            {lines.map((line, i) => {
                const sev = line.severity ?? 'log';
                const sevColor = SEVERITY_COLORS[sev] ?? 'text-muted';
                const tick = line.tick != null ? `[t${line.tick}]` : '';
                const hasContext = line.context != null && Object.keys(line.context as object).length > 0;
                return (
                    <div key={i} className="border border-border-custom/40 rounded px-2 py-1 bg-surface-light/40">
                        <div className="flex items-start gap-2 flex-wrap">
                            <span className={`uppercase font-semibold shrink-0 ${sevColor}`}>{sev}</span>
                            {tick && <span className="text-zinc-500 shrink-0">{tick}</span>}
                            {line.playerId && (
                                <span className="text-zinc-500 shrink-0">p:{line.playerId}</span>
                            )}
                            {line.gameId && (
                                <span className="text-zinc-500 shrink-0 truncate max-w-[120px]" title={line.gameId}>
                                    g:{line.gameId}
                                </span>
                            )}
                            <span className="text-white flex-1 whitespace-pre-wrap break-all">{line.message}</span>
                        </div>
                        {hasContext && (
                            <pre className="mt-1 text-zinc-400 text-[10px] whitespace-pre-wrap break-all">
                                {JSON.stringify(line.context, null, 2)}
                            </pre>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
