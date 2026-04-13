/**
 * Debug console - press tilde (~) three times to enable, once to disable.
 * Shows game state JSON, player account JSON, and characters in a collapsible panel.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameStatePayload, CampaignState } from '../../types';
import type { CampaignCharacterPayload } from '../../LobbyClient';
import DebugBattleActionsTab from './tabs/DebugBattleActionsTab';
import DebugGameStateTab from './tabs/DebugGameStateTab';
import DebugOrdersTab from './tabs/DebugOrdersTab';
import DebugUnitsTab from './tabs/DebugUnitsTab';
import DebugPlayerDataTab from './tabs/DebugPlayerDataTab';
import DebugCampaignDataTab from './tabs/DebugCampaignDataTab';
import DebugCharactersTab from './tabs/DebugCharactersTab';
import DebugTabButton from './DebugTabButton';

export type TabId = 'battle-actions' | 'game-state' | 'units' | 'orders' | 'player-data' | 'campaign-data' | 'characters';

export interface DebugConsoleProps {
    gameState: GameStatePayload | null;
    playerName: string | null;
    /** When true, show the Battle Actions tab (e.g. in Minion Battles battle phase). */
    inBattle?: boolean;
    /** When true, show Battle Actions only to admins and prefer it as the default tab. */
    isAdmin?: boolean;
    /** Host-only: skip the current player's turn (battle phase). */
    skipCurrentTurn?: (() => void) | null;
    /** When true, show skip turn button (host only). */
    isHost?: boolean;
    fetchPlayerData: () => Promise<Record<string, unknown> | null>;
    fetchCampaignData: () => Promise<CampaignState | null>;
    fetchCharactersList: () => Promise<CampaignCharacterPayload[]>;
    getCharacter: (characterId: string) => Promise<CampaignCharacterPayload>;
}

interface MouseDebugInfo {
    worldX: number;
    worldY: number;
    row: number;
    col: number;
    terrainName: string;
}

export default function DebugConsole({
    gameState,
    playerName,
    inBattle = false,
    isAdmin = false,
    skipCurrentTurn = null,
    isHost = false,
    fetchPlayerData,
    fetchCampaignData,
    fetchCharactersList,
    getCharacter,
}: DebugConsoleProps) {
    const [debugMode, setDebugMode] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [, setTildeCount] = useState(0);
    const [activeTab, setActiveTab] = useState<TabId>(() => (inBattle && isAdmin ? 'battle-actions' : 'game-state'));

    const [mouseDebug, setMouseDebug] = useState<MouseDebugInfo | null>(null);

    // Used to gray out the Characters tab until the list has been fetched at least once.
    const [charactersListMeta, setCharactersListMeta] = useState<{ isNull: boolean; isLoading: boolean }>({ isNull: true, isLoading: false });

    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key !== '`' && e.key !== '~') return;
            if (debugMode) {
                setDebugMode(false);
                setTildeCount(0);
            } else {
                setTildeCount((prev) => {
                    const next = prev + 1;
                    if (next >= 3) {
                        setDebugMode(true);
                        return 0;
                    }
                    return next;
                });
            }
        },
        [debugMode],
    );

    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onKeyDown]);

    useEffect(() => {
        const id = window.setInterval(() => {
            const data = (window as unknown as { __minionBattlesDebugMouse?: MouseDebugInfo | null }).__minionBattlesDebugMouse;
            if (!data) return;
            setMouseDebug((prev) => {
                if (!prev) return { ...data };
                if (prev.worldX === data.worldX && prev.worldY === data.worldY && prev.row === data.row && prev.col === data.col && prev.terrainName === data.terrainName) {
                    return prev;
                }
                return { ...data };
            });
        }, 100);

        return () => {
            window.clearInterval(id);
        };
    }, []);

    // When leaving battle or losing admin while on Battle Actions tab, switch back to Game State.
    useEffect(() => {
        if ((!inBattle || !isAdmin) && activeTab === 'battle-actions') {
            setActiveTab('game-state');
        }
    }, [inBattle, isAdmin, activeTab]);

    // When leaving battle, units / orders tabs no longer exist.
    useEffect(() => {
        if (!inBattle && (activeTab === 'units' || activeTab === 'orders')) {
            setActiveTab('game-state');
        }
    }, [inBattle, activeTab]);

    const tabLabel = playerName ? `${playerName} Data` : 'Player Data';
    const charactersTabGrayed = charactersListMeta.isNull && !charactersListMeta.isLoading;

    const content = useMemo(() => {
        return (
            <>
                <DebugBattleActionsTab isActive={activeTab === 'battle-actions'} inBattle={inBattle} isAdmin={isAdmin} isHost={isHost} skipCurrentTurn={skipCurrentTurn} />
                <DebugGameStateTab isActive={activeTab === 'game-state'} gameState={gameState} />
                <DebugUnitsTab isActive={activeTab === 'units'} inBattle={inBattle} gameState={gameState} />
                <DebugOrdersTab isActive={activeTab === 'orders'} inBattle={inBattle} gameState={gameState} />
                <DebugPlayerDataTab isActive={activeTab === 'player-data'} fetchPlayerData={fetchPlayerData} />
                <DebugCampaignDataTab isActive={activeTab === 'campaign-data'} fetchCampaignData={fetchCampaignData} />
                <DebugCharactersTab
                    isActive={activeTab === 'characters'}
                    fetchCharactersList={fetchCharactersList}
                    getCharacter={getCharacter}
                    onListMetaChange={setCharactersListMeta}
                />
            </>
        );
    }, [activeTab, fetchCampaignData, fetchCharactersList, fetchPlayerData, getCharacter, gameState, inBattle, isAdmin, isHost, skipCurrentTurn]);

    if (!debugMode) return null;

    return (
        <div
            className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-[9999] bg-surface/[0.92] backdrop-blur border border-border-custom rounded-t-lg shadow flex flex-col overflow-hidden transition-all duration-200 ${
                expanded ? 'w-[60vw] h-[60vh]' : 'w-auto h-auto max-h-[60px]'
            }`}
        >
            <div className={`p-2 shrink-0 flex items-center justify-between gap-4 ${expanded ? 'min-w-[260px]' : ''}`}>
                <div>
                    <button
                        className="px-4 py-2 text-sm bg-surface-light text-white border border-border-custom rounded hover:bg-border-custom transition-colors"
                        onClick={() => setExpanded(!expanded)}
                    >
                        Debug
                    </button>
                </div>
                {expanded && (
                    <>
                        <div className="flex-1 text-center text-[11px] leading-tight text-muted font-mono">
                            {mouseDebug ? (
                                <>
                                    <div>
                                        x {mouseDebug.worldX.toFixed(1)}, y {mouseDebug.worldY.toFixed(1)}
                                    </div>
                                    <div>
                                        row {mouseDebug.row}, col {mouseDebug.col}
                                    </div>
                                    <div>{mouseDebug.terrainName}</div>
                                </>
                            ) : (
                                <div>No mouse</div>
                            )}
                        </div>
                        <div className="w-10" />
                    </>
                )}
            </div>

            {expanded && (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex gap-1 px-2 border-b border-border-custom shrink-0">
                        {inBattle && isAdmin && (
                            <DebugTabButton
                                isActive={activeTab === 'battle-actions'}
                                onClick={() => setActiveTab('battle-actions')}
                            >
                                Battle Actions
                            </DebugTabButton>
                        )}

                        <DebugTabButton isActive={activeTab === 'game-state'} onClick={() => setActiveTab('game-state')}>
                            Game State
                        </DebugTabButton>

                        {inBattle && (
                            <DebugTabButton isActive={activeTab === 'units'} onClick={() => setActiveTab('units')}>
                                Units
                            </DebugTabButton>
                        )}

                        {inBattle && (
                            <DebugTabButton isActive={activeTab === 'orders'} onClick={() => setActiveTab('orders')}>
                                Orders
                            </DebugTabButton>
                        )}

                        <DebugTabButton isActive={activeTab === 'player-data'} onClick={() => setActiveTab('player-data')}>
                            {tabLabel}
                        </DebugTabButton>

                        <DebugTabButton isActive={activeTab === 'campaign-data'} onClick={() => setActiveTab('campaign-data')}>
                            Campaign data
                        </DebugTabButton>

                        <DebugTabButton
                            isActive={activeTab === 'characters'}
                            isDisabled={charactersTabGrayed && activeTab !== 'characters'}
                            onClick={() => setActiveTab('characters')}
                            title={charactersTabGrayed ? 'Opens tab and loads characters from /api/account/characters' : undefined}
                        >
                            Characters
                        </DebugTabButton>
                    </div>

                    <div className="flex-1 overflow-auto p-3 min-h-0">{content}</div>
                </div>
            )}
        </div>
    );
}

