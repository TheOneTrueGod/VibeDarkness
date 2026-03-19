/**
 * Debug console - press tilde (~) three times to enable, once to disable.
 * Shows game state JSON, player account JSON, and characters in a collapsible panel.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { GameStatePayload, CampaignState } from '../types';
import type { CampaignCharacterPayload } from '../LobbyClient';
import { useDebugSettings } from '../contexts/DebugSettingsContext';

type TabId = 'battle-actions' | 'game-state' | 'units' | 'player-data' | 'campaign-data' | 'characters';

interface DebugConsoleProps {
    gameState: GameStatePayload | null;
    playerName: string | null;
    /** When true, show the Battle Actions tab (e.g. in Minion Battles battle phase). */
    inBattle?: boolean;
    /** When true, show Battle Actions only to admins and prefer it as the default tab. */
    isAdmin?: boolean;
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
    fetchPlayerData,
    fetchCampaignData,
    fetchCharactersList,
    getCharacter,
}: DebugConsoleProps) {
    const [debugMode, setDebugMode] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [tildeCount, setTildeCount] = useState(0);
    const [activeTab, setActiveTab] = useState<TabId>(() =>
        inBattle && isAdmin ? 'battle-actions' : 'game-state',
    );
    const [playerData, setPlayerData] = useState<Record<string, unknown> | null>(null);
    const [playerDataLoading, setPlayerDataLoading] = useState(false);
    const [playerDataError, setPlayerDataError] = useState<string | null>(null);

    const [campaignData, setCampaignData] = useState<CampaignState | null>(null);
    const [campaignDataLoading, setCampaignDataLoading] = useState(false);
    const [campaignDataError, setCampaignDataError] = useState<string | null>(null);

    const [charactersList, setCharactersList] = useState<CampaignCharacterPayload[] | null>(null);
    const [charactersListLoading, setCharactersListLoading] = useState(false);
    const [charactersListError, setCharactersListError] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [characterDetail, setCharacterDetail] = useState<CampaignCharacterPayload | null>(null);
    const [characterDetailLoading, setCharacterDetailLoading] = useState(false);
    const [characterDetailError, setCharacterDetailError] = useState<string | null>(null);
    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
    const [unitStateOpen, setUnitStateOpen] = useState(false);
    const [aiStateOpen, setAiStateOpen] = useState(false);

    // Lazy-load portrait assets only when opening the Units debug tab.
    const [getPortraitFn, setGetPortraitFn] = useState<((id: string) => { picture: string } | undefined) | null>(null);
    const portraitUriCacheRef = useRef<Map<string, string>>(new Map());
    const [mouseDebug, setMouseDebug] = useState<MouseDebugInfo | null>(null);
    const {
        darkOverlayEnabled,
        godModeEnabled,
        superSpeedEnabled,
        setDarkOverlayEnabled,
        setGodModeEnabled,
        setSuperSpeedEnabled,
    } = useDebugSettings();

    // When leaving battle or losing admin while on Battle Actions tab, switch back to Game State
    useEffect(() => {
        if ((!inBattle || !isAdmin) && activeTab === 'battle-actions') {
            setActiveTab('game-state');
        }
    }, [inBattle, isAdmin, activeTab]);

    // When leaving battle, units tab no longer exists.
    useEffect(() => {
        if (!inBattle && activeTab === 'units') {
            setActiveTab('game-state');
        }
        if (!inBattle) {
            setSelectedUnitId(null);
            setHoveredUnitId(null);
            setUnitStateOpen(false);
            setAiStateOpen(false);
            (window as unknown as { __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void }).__minionBattlesDebugSetUnitHover?.(null);
        }
    }, [inBattle, activeTab]);

    // Clear world hover highlight whenever the user leaves the Units tab.
    useEffect(() => {
        if (activeTab !== 'units') {
            setHoveredUnitId(null);
            (window as unknown as { __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void }).__minionBattlesDebugSetUnitHover?.(null);
        }
    }, [activeTab]);

    useEffect(() => {
        // Collapse the drawer when selecting a different unit.
        setUnitStateOpen(false);
        setAiStateOpen(false);
    }, [selectedUnitId]);

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
        [debugMode]
    );

    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onKeyDown]);

    useEffect(() => {
        const id = window.setInterval(() => {
            const data = window.__minionBattlesDebugMouse;
            if (!data) return;
            setMouseDebug((prev) => {
                if (
                    prev &&
                    prev.worldX === data.worldX &&
                    prev.worldY === data.worldY &&
                    prev.row === data.row &&
                    prev.col === data.col &&
                    prev.terrainName === data.terrainName
                ) {
                    return prev;
                }
                return { ...data };
            });
        }, 100);
        return () => {
            window.clearInterval(id);
        };
    }, []);

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
        }
    }, [fetchPlayerData]);

    useEffect(() => {
        if (activeTab === 'player-data' && playerData === null && !playerDataLoading && !playerDataError) {
            loadPlayerData();
        }
    }, [activeTab, playerData, playerDataLoading, playerDataError, loadPlayerData]);

    const loadCampaignData = useCallback(async () => {
        setCampaignDataLoading(true);
        setCampaignDataError(null);
        try {
            const data = await fetchCampaignData();
            setCampaignData(data ?? null);
        } catch (err) {
            setCampaignDataError(err instanceof Error ? err.message : 'Failed to load campaign');
            setCampaignData(null);
        } finally {
            setCampaignDataLoading(false);
        }
    }, [fetchCampaignData]);

    useEffect(() => {
        if (activeTab === 'campaign-data' && campaignData === null && !campaignDataLoading && !campaignDataError) {
            loadCampaignData();
        }
    }, [activeTab, campaignData, campaignDataLoading, campaignDataError, loadCampaignData]);

    const loadCharactersList = useCallback(async () => {
        setCharactersListLoading(true);
        setCharactersListError(null);
        try {
            const list = await fetchCharactersList();
            setCharactersList(list);
        } catch (err) {
            setCharactersListError(err instanceof Error ? err.message : 'Failed to load characters');
            setCharactersList(null);
        } finally {
            setCharactersListLoading(false);
        }
    }, [fetchCharactersList]);

    const loadCharacterDetail = useCallback(
        async (characterId: string) => {
            setCharacterDetailLoading(true);
            setCharacterDetailError(null);
            try {
                const char = await getCharacter(characterId);
                setCharacterDetail(char);
            } catch (err) {
                setCharacterDetailError(err instanceof Error ? err.message : 'Failed to load character');
                setCharacterDetail(null);
            } finally {
                setCharacterDetailLoading(false);
            }
        },
        [getCharacter]
    );

    useEffect(() => {
        if (activeTab === 'characters' && charactersList === null && !charactersListLoading && !charactersListError) {
            loadCharactersList();
        }
    }, [activeTab, charactersList, charactersListLoading, charactersListError, loadCharactersList]);

    useEffect(() => {
        if (selectedCharacterId && activeTab === 'characters') {
            loadCharacterDetail(selectedCharacterId);
        } else {
            setCharacterDetail(null);
            setCharacterDetailError(null);
        }
    }, [selectedCharacterId, activeTab, loadCharacterDetail]);

    const tabLabel = playerName ? `${playerName} Data` : 'Player Data';
    const charactersTabGrayed = charactersList === null && !charactersListLoading;

    // ========================================================================
    // Units (battle-missions only)
    // ========================================================================
    type DebugUnit = Record<string, unknown> & {
        id: string;
        name?: unknown;
        characterId?: unknown;
        teamId?: unknown;
        ownerId?: unknown;
        hp?: unknown;
        maxHp?: unknown;
        cooldownRemaining?: unknown;
        corruptionProgress?: unknown;
        // Units runtime serialization always includes these, but we only summarize them in the UI.
        radius?: unknown;
        aiContext?: {
            aiStateSerialized?: Record<string, unknown> | undefined;
            defensePointTargetId?: string;
            aiTargetUnitId?: string;
            corruptingTargetId?: string;
            corruptingStartedAt?: number;
            [k: string]: unknown;
        };
        activeAbilities?: unknown[];
        movement?: unknown;
    };

    const units = useMemo(() => {
        if (!gameState?.game) return [];
        const raw = (gameState.game as unknown as { units?: unknown }).units;
        if (!Array.isArray(raw)) return [];
        return raw.filter(
            (u): u is DebugUnit => typeof u === 'object' && u !== null && typeof (u as any).id === 'string',
        );
    }, [gameState]);

    useEffect(() => {
        if (activeTab !== 'units' || !inBattle || getPortraitFn) return;
        void import('../games/minion_battles/character_defs/portraits')
            .then((mod) => {
                setGetPortraitFn(() => (mod as unknown as { getPortrait: (id: string) => unknown }).getPortrait as (id: string) => { picture: string } | undefined);
            })
            .catch(() => {
                // Non-fatal: units will fall back to placeholders.
                setGetPortraitFn(null);
            });
    }, [activeTab, inBattle, getPortraitFn]);

    const getPortraitDataUri = (characterId: unknown): string | null => {
        if (!getPortraitFn) return null;
        const cid = typeof characterId === 'string' ? characterId : null;
        if (!cid) return null;
        const cached = portraitUriCacheRef.current.get(cid);
        if (cached) return cached;
        const portrait = getPortraitFn(cid) as unknown as { picture?: string } | undefined;
        const picture = portrait?.picture;
        if (!picture) return null;
        const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(picture)}`;
        portraitUriCacheRef.current.set(cid, uri);
        return uri;
    };

    const findUnitById = useCallback(
        (id: string | null) => {
            if (!id) return null;
            return units.find((u) => u.id === id) ?? null;
        },
        [units],
    );

    const selectedUnit = useMemo(() => findUnitById(selectedUnitId), [findUnitById, selectedUnitId]);

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
                            <button
                                type="button"
                                className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                    activeTab === 'battle-actions'
                                        ? 'border-b-primary text-primary'
                                        : 'border-b-transparent text-muted hover:text-white'
                                }`}
                                onClick={() => setActiveTab('battle-actions')}
                            >
                                Battle Actions
                            </button>
                        )}
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                activeTab === 'game-state'
                                    ? 'border-b-primary text-primary'
                                    : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('game-state')}
                        >
                            Game State
                        </button>
                        {inBattle && (
                            <button
                                type="button"
                                className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                    activeTab === 'units'
                                        ? 'border-b-primary text-primary'
                                        : 'border-b-transparent text-muted hover:text-white'
                                }`}
                                onClick={() => setActiveTab('units')}
                            >
                                Units
                            </button>
                        )}
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                activeTab === 'player-data'
                                    ? 'border-b-primary text-primary'
                                    : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('player-data')}
                        >
                            {tabLabel}
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                activeTab === 'campaign-data'
                                    ? 'border-b-primary text-primary'
                                    : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('campaign-data')}
                        >
                            Campaign data
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                charactersTabGrayed && activeTab !== 'characters'
                                    ? 'border-b-transparent text-muted opacity-60'
                                    : activeTab === 'characters'
                                      ? 'border-b-primary text-primary'
                                      : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('characters')}
                            title={charactersTabGrayed ? 'Opens tab and loads characters from /api/account/characters' : undefined}
                        >
                            Characters
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-3 min-h-0">
                        {activeTab === 'battle-actions' && isAdmin && (
                            <div className="flex flex-col gap-2 text-sm text-muted">
                                <div className="flex items-center gap-2">
                                    <span>Darkness layer</span>
                                    <button
                                        type="button"
                                        className={`px-3 py-1.5 text-xs rounded border border-border-custom ${
                                            darkOverlayEnabled
                                                ? 'bg-primary/20 text-primary border-primary/50'
                                                : 'bg-surface-light text-white hover:bg-border-custom'
                                        }`}
                                        onClick={() => setDarkOverlayEnabled(!darkOverlayEnabled)}
                                    >
                                        {darkOverlayEnabled ? 'On' : 'Off'}
                                    </button>
                                    <span className="text-[11px] text-muted">
                                        When off, the battle map hides the light/darkness overlay.
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>God mode</span>
                                    <button
                                        type="button"
                                        className={`px-3 py-1.5 text-xs rounded border border-border-custom ${
                                            godModeEnabled
                                                ? 'bg-primary/20 text-primary border-primary/50'
                                                : 'bg-surface-light text-white hover:bg-border-custom'
                                        }`}
                                        onClick={() => setGodModeEnabled(!godModeEnabled)}
                                    >
                                        {godModeEnabled ? 'On' : 'Off'}
                                    </button>
                                    <span className="text-[11px] text-muted">
                                        Player-controlled units do not lose HP while enabled.
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>Super Speed</span>
                                    <button
                                        type="button"
                                        className={`px-3 py-1.5 text-xs rounded border border-border-custom ${
                                            superSpeedEnabled
                                                ? 'bg-primary/20 text-primary border-primary/50'
                                                : 'bg-surface-light text-white hover:bg-border-custom'
                                        }`}
                                        onClick={() => setSuperSpeedEnabled(!superSpeedEnabled)}
                                    >
                                        {superSpeedEnabled ? 'On' : 'Off'}
                                    </button>
                                    <span className="text-[11px] text-muted">
                                        Player-controlled units move 10x faster while enabled.
                                    </span>
                                </div>
                            </div>
                        )}
                        {activeTab === 'game-state' && (
                            <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                <code>
                                    {gameState
                                        ? JSON.stringify(gameState, null, 2)
                                        : 'No game state yet.'}
                                </code>
                            </pre>
                        )}
                        {activeTab === 'units' && (
                            <div className="flex flex-1 min-h-0 gap-3">
                                <div className="flex flex-col shrink-0 w-56 border-r border-border-custom pr-2 min-h-0">
                                    <div className="px-2 py-1 text-[11px] text-muted font-mono border-b border-border-custom">
                                        Units ({units.length})
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        {units.length === 0 ? (
                                            <p className="m-0 text-muted text-sm">No units in state.</p>
                                        ) : (
                                            <div className="flex flex-col">
                                                {units.map((u) => {
                                                    const unitId = u.id as string;
                                                    const name = typeof u.name === 'string' ? u.name : unitId;
                                                    const characterId = typeof u.characterId === 'string' ? u.characterId : undefined;
                                                    const portraitSrc = characterId ? getPortraitDataUri(characterId) : null;
                                                    const isSelected = selectedUnitId === unitId;
                                                    const isHovered = hoveredUnitId === unitId;

                                                    return (
                                                        <button
                                                            key={unitId}
                                                            type="button"
                                                            className={`text-left px-2 py-1.5 rounded text-sm truncate ${
                                                                isSelected
                                                                    ? 'bg-primary/30 text-primary border border-primary/60'
                                                                    : isHovered
                                                                        ? 'bg-primary/20 text-primary border border-primary/30'
                                                                        : 'text-white hover:bg-border-custom'
                                                            }`}
                                                            onMouseEnter={() => {
                                                                setHoveredUnitId(unitId);
                                                                (window as unknown as { __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void }).__minionBattlesDebugSetUnitHover?.(
                                                                    unitId,
                                                                );
                                                            }}
                                                            onMouseLeave={() => {
                                                                setHoveredUnitId(null);
                                                                (window as unknown as { __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void }).__minionBattlesDebugSetUnitHover?.(
                                                                    null,
                                                                );
                                                            }}
                                                            onClick={() => setSelectedUnitId(unitId)}
                                                            title={name}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-6 h-6 rounded border border-border-custom bg-surface-light/20 overflow-hidden flex items-center justify-center shrink-0">
                                                                    {portraitSrc ? (
                                                                        <img src={portraitSrc} alt={name} className="w-6 h-6 block" />
                                                                    ) : (
                                                                        <span className="text-[10px] text-muted font-mono">{name.charAt(0).toUpperCase()}</span>
                                                                    )}
                                                                </div>
                                                                <span className="truncate">{name}</span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 min-w-0 overflow-auto">
                                    {!selectedUnit ? (
                                        <p className="m-0 text-muted text-sm">Select a unit to inspect.</p>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded border border-border-custom bg-surface-light/20 overflow-hidden flex items-center justify-center shrink-0">
                                                    {(() => {
                                                        const characterId = typeof selectedUnit.characterId === 'string' ? selectedUnit.characterId : undefined;
                                                        const portraitSrc = characterId ? getPortraitDataUri(characterId) : null;
                                                        if (portraitSrc) {
                                                            const name = typeof selectedUnit.name === 'string' ? selectedUnit.name : selectedUnit.id;
                                                            return <img src={portraitSrc} alt={name} className="w-10 h-10 block" />;
                                                        }
                                                        const name = typeof selectedUnit.name === 'string' ? selectedUnit.name : String(selectedUnit.id);
                                                        return <span className="text-sm text-muted font-mono">{name.charAt(0).toUpperCase()}</span>;
                                                    })()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold truncate">
                                                        {typeof selectedUnit.name === 'string' ? selectedUnit.name : String(selectedUnit.id)}
                                                    </div>
                                                    <div className="text-[11px] text-muted font-mono truncate">{String(selectedUnit.id)}</div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                                <span className="text-muted">characterId</span>
                                                <span className="text-white">{typeof selectedUnit.characterId === 'string' ? selectedUnit.characterId : '-'}</span>

                                                <span className="text-muted">teamId</span>
                                                <span className="text-white">{typeof selectedUnit.teamId === 'string' ? selectedUnit.teamId : '-'}</span>

                                                <span className="text-muted">ownerId</span>
                                                <span className="text-white">{typeof selectedUnit.ownerId === 'string' ? selectedUnit.ownerId : '-'}</span>

                                                <span className="text-muted">HP</span>
                                                <span className="text-white">
                                                    {typeof selectedUnit.hp === 'number' ? selectedUnit.hp : '-'}
                                                    {' / '}
                                                    {typeof selectedUnit.maxHp === 'number' ? selectedUnit.maxHp : '-'}
                                                </span>

                                                <span className="text-muted">cooldown</span>
                                                <span className="text-white">
                                                    {typeof selectedUnit.cooldownRemaining === 'number' ? selectedUnit.cooldownRemaining : '-'}
                                                </span>

                                                <span className="text-muted">corruption</span>
                                                <span className="text-white">
                                                    {typeof selectedUnit.corruptionProgress === 'number' ? selectedUnit.corruptionProgress : '-'}
                                                </span>

                                                <span className="text-muted">movement.pathLen</span>
                                                <span className="text-white">
                                                    {selectedUnit.movement && typeof (selectedUnit.movement as any).path !== 'undefined'
                                                        ? (selectedUnit.movement as any)?.path?.length ?? '-'
                                                        : '-'}
                                                </span>

                                                <span className="text-muted">movement.dest</span>
                                                <span className="text-white">
                                                    {(() => {
                                                        const movement = selectedUnit.movement as any;
                                                        const path = Array.isArray(movement?.path) ? (movement.path as Array<{ col: number; row: number }>) : null;
                                                        if (!path || path.length === 0) return '-';
                                                        const last = path[path.length - 1];
                                                        if (typeof last?.col !== 'number' || typeof last?.row !== 'number') return '-';
                                                        return `(${last.col},${last.row})`;
                                                    })()}
                                                </span>

                                                <span className="text-muted">activeAbilities</span>
                                                <span className="text-white">
                                                    {Array.isArray((selectedUnit as any).activeAbilities) ? (selectedUnit as any).activeAbilities.length : '-'}
                                                </span>

                                            </div>

                                            {/* AI state expander (kept near unitState, not inside the grid). */}
                                            <button
                                                type="button"
                                                className="px-3 py-2 bg-surface-light border border-border-custom rounded text-sm hover:bg-border-custom transition-colors text-left"
                                                onClick={() => setAiStateOpen((v) => !v)}
                                            >
                                                AI state
                                            </button>

                                            {aiStateOpen && (
                                                <div className="border border-border-custom rounded bg-surface-light/20 p-2 overflow-auto max-h-72">
                                                    {(() => {
                                                        const aiContext = selectedUnit.aiContext as any | undefined;
                                                        const aiState = aiContext?.aiStateSerialized as Record<string, unknown> | undefined;
                                                        const stateId = typeof aiState?.stateId === 'string' ? aiState.stateId : '-';
                                                        return (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                                                    <span className="text-muted">stateId</span>
                                                                    <span className="text-white">{stateId}</span>
                                                                </div>
                                                                <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                                                    <code>{aiState ? JSON.stringify(aiState, null, 2) : '{ }'}</code>
                                                                </pre>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                className="px-3 py-2 bg-surface-light border border-border-custom rounded text-sm hover:bg-border-custom transition-colors text-left"
                                                onClick={() => setUnitStateOpen((v) => !v)}
                                            >
                                                unitState
                                            </button>

                                            {unitStateOpen && (
                                                <div className="border border-border-custom rounded bg-surface-light/20 p-2 overflow-auto max-h-72">
                                                    <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                                        <code>{JSON.stringify(selectedUnit, null, 2)}</code>
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeTab === 'player-data' && (
                            <>
                                {playerDataLoading && (
                                    <p className="m-0 text-muted text-sm">Loading...</p>
                                )}
                                {playerDataError && (
                                    <p className="m-0 text-red-400 text-sm">{playerDataError}</p>
                                )}
                                {!playerDataLoading && !playerDataError && (
                                    <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                        <code>
                                            {playerData !== null
                                                ? JSON.stringify(playerData, null, 2)
                                                : 'No player data.'}
                                        </code>
                                    </pre>
                                )}
                            </>
                        )}
                        {activeTab === 'campaign-data' && (
                            <>
                                {campaignDataLoading && (
                                    <p className="m-0 text-muted text-sm">Loading...</p>
                                )}
                                {campaignDataError && (
                                    <p className="m-0 text-red-400 text-sm">{campaignDataError}</p>
                                )}
                                {!campaignDataLoading && !campaignDataError && (
                                    <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                        <code>
                                            {campaignData !== null
                                                ? JSON.stringify(campaignData, null, 2)
                                                : 'No campaign data (no campaign selected or no campaign IDs).'}
                                        </code>
                                    </pre>
                                )}
                            </>
                        )}
                        {activeTab === 'characters' && (
                            <div className="flex flex-1 min-h-0 gap-3">
                                <div className="flex flex-col shrink-0 w-40 border-r border-border-custom pr-2">
                                    {charactersListLoading && (
                                        <p className="m-0 text-muted text-sm">Loading list...</p>
                                    )}
                                    {charactersListError && (
                                        <p className="m-0 text-red-400 text-sm">{charactersListError}</p>
                                    )}
                                    {!charactersListLoading && !charactersListError && charactersList && (
                                        <>
                                            {charactersList.length === 0 ? (
                                                <p className="m-0 text-muted text-sm">No characters.</p>
                                            ) : (
                                                charactersList.map((c) => (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        className={`text-left px-2 py-1.5 rounded text-sm truncate ${
                                                            selectedCharacterId === c.id
                                                                ? 'bg-primary/20 text-primary'
                                                                : 'text-white hover:bg-border-custom'
                                                        }`}
                                                        onClick={() => setSelectedCharacterId(c.id)}
                                                    >
                                                        {c.name ?? c.id}
                                                    </button>
                                                ))
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 overflow-auto">
                                    {!selectedCharacterId && (
                                        <p className="m-0 text-muted text-sm">Select a character.</p>
                                    )}
                                    {selectedCharacterId && characterDetailLoading && (
                                        <p className="m-0 text-muted text-sm">Loading...</p>
                                    )}
                                    {selectedCharacterId && characterDetailError && (
                                        <p className="m-0 text-red-400 text-sm">{characterDetailError}</p>
                                    )}
                                    {selectedCharacterId && !characterDetailLoading && !characterDetailError && characterDetail && (
                                        <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                            <code>{JSON.stringify(characterDetail, null, 2)}</code>
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
