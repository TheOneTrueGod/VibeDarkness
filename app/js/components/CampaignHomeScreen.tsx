/**
 * Campaign home - tabbed view: Welcome, Mission Select, Join Mission.
 * Shown when user is logged in and on the lobby screen (no active lobby).
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LobbyClient } from '../LobbyClient';
import { useUser } from '../contexts/UserContext';
import type { CampaignState } from '../types';
import { STORYLINES, MISSION_MAP } from '../games/minion_battles/storylines';
import { getUnlockedMissionIds, getAllMissionIdsInOrder, hasVictoryResult } from '../games/minion_battles/storylines/unlock';
import RecentLobbiesList, { type RecentLobbyInfo } from './RecentLobbiesList';

type TabId = 'welcome' | 'mission_select' | 'join_mission';

const TAB_IDS: TabId[] = ['welcome', 'mission_select', 'join_mission'];

/** Per-tab settings: label and whether the tab is visible for the current user. */
const TAB_SETTINGS: Record<
    TabId,
    { label: string; isVisible: (isAdmin: boolean) => boolean }
> = {
    welcome: { label: 'Welcome', isVisible: () => true },
    mission_select: { label: 'Mission Select', isVisible: (isAdmin) => isAdmin },
    join_mission: { label: 'Join Mission', isVisible: () => true },
};

/** Default tab when no tab is selected; non-admins see Join Mission first. */
function getDefaultTab(isAdmin: boolean): TabId {
    return isAdmin ? 'mission_select' : 'join_mission';
}

interface CampaignHomeScreenProps {
    lobbyClient: LobbyClient;
    onSelectMission: (missionId: string, campaignId: string | null) => Promise<void>;
    onJoinLobby: (lobbyId: string) => Promise<void>;
    refetchUser: () => Promise<void>;
}

export default function CampaignHomeScreen({
    lobbyClient,
    onSelectMission,
    onJoinLobby,
    refetchUser,
}: CampaignHomeScreenProps) {
    const { user, role } = useUser();
    const isAdmin = role === 'admin';
    const defaultTab = getDefaultTab(isAdmin);
    const visibleTabs = useMemo(
        () => TAB_IDS.filter((id) => TAB_SETTINGS[id].isVisible(isAdmin)),
        [isAdmin]
    );
    const [activeTab, setActiveTab] = useState<TabId>(() => defaultTab);

    // When admin status or visibility changes, ensure active tab is visible; otherwise switch to default.
    useEffect(() => {
        if (!visibleTabs.includes(activeTab)) {
            setActiveTab(defaultTab);
        }
    }, [isAdmin, visibleTabs, activeTab, defaultTab]);
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [campaignLoading, setCampaignLoading] = useState(false);
    const [creatingCampaign, setCreatingCampaign] = useState(false);
    const [selectingMission, setSelectingMission] = useState(false);
    const [lobbyCode, setLobbyCode] = useState('');
    const [recentLobbyInfos, setRecentLobbyInfos] = useState<RecentLobbyInfo[]>([]);

    const campaignIds = user?.campaignIds ?? [];
    const hasCampaign = campaignIds.length > 0;

    // Load first campaign when user has campaignIds
    useEffect(() => {
        if (!hasCampaign) {
            setCampaign(null);
            return;
        }
        let cancelled = false;
        setCampaignLoading(true);
        lobbyClient
            .getCampaign(campaignIds[0]!)
            .then((c) => {
                if (!cancelled) setCampaign(c);
            })
            .catch(() => {
                if (!cancelled) setCampaign(null);
            })
            .finally(() => {
                if (!cancelled) setCampaignLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [hasCampaign, campaignIds[0], lobbyClient]);

    const handleCreateFirstCampaign = useCallback(async () => {
        setCreatingCampaign(true);
        try {
            const newCampaign = await lobbyClient.createCampaign();
            await refetchUser();
            setCampaign(newCampaign);
        } finally {
            setCreatingCampaign(false);
        }
    }, [lobbyClient, refetchUser]);

    // Active lobbies for Join tab (lobbies that had a get-state call in the last 10 minutes)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const list = await lobbyClient.getActiveLobbies();
            if (cancelled) return;
            const infos: RecentLobbyInfo[] = list.map((entry) => ({
                id: entry.lobby_id,
                name: entry.name ?? entry.lobby_id,
                lobbyState: (entry.lobbyState as 'home' | 'in_game') ?? 'home',
                gameType: entry.gameType ?? null,
                playerCount: entry.player_ids?.length ?? 0,
            }));
            setRecentLobbyInfos(infos);
        })();
        return () => {
            cancelled = true;
        };
    }, [lobbyClient]);

    const handleJoinByCode = useCallback(async () => {
        const code = lobbyCode.trim().toUpperCase();
        if (!code) return;
        await onJoinLobby(code);
    }, [lobbyCode, onJoinLobby]);

    const handleMissionClick = useCallback(
        async (missionId: string) => {
            if (selectingMission) return;
            setSelectingMission(true);
            try {
                await onSelectMission(missionId, campaign?.id ?? null);
            } finally {
                setSelectingMission(false);
            }
        },
        [onSelectMission, selectingMission, campaign?.id]
    );

    const missionResults = campaign?.missionResults ?? [];

    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex-1 max-w-[800px] mx-auto w-full px-5 py-8 max-md:px-5 max-md:py-5">
                <h1 className="text-center text-4xl max-md:text-3xl font-bold mb-8 text-primary">
                    Minion Battles
                </h1>

                {!hasCampaign && (
                    <div className="bg-surface rounded-lg p-6 mb-6 text-center">
                        <p className="text-muted mb-4">Start your journey with a new campaign.</p>
                        <button
                            className="px-6 py-3 bg-primary text-secondary font-semibold rounded hover:bg-primary-hover transition-all disabled:opacity-50"
                            onClick={handleCreateFirstCampaign}
                            disabled={creatingCampaign}
                        >
                            {creatingCampaign ? 'Creating…' : 'Create your first campaign'}
                        </button>
                    </div>
                )}

                {hasCampaign && campaignLoading && (
                    <div className="text-center text-muted py-8">Loading campaign…</div>
                )}

                {hasCampaign && !campaignLoading && campaign && (
                    <>
                        {activeTab === 'welcome' && (
                            <div className="flex items-center justify-center min-h-[200px]">
                                <span className="text-2xl text-muted">Welcome</span>
                            </div>
                        )}

                        {activeTab === 'mission_select' && (
                            <div className="space-y-8">
                                <h2 className="text-xl font-semibold text-muted">Storylines</h2>
                                {STORYLINES.map((storyline) => {
                                    const unlocked = getUnlockedMissionIds(storyline, missionResults);
                                    const missionIds = getAllMissionIdsInOrder(storyline);
                                    return (
                                        <div key={storyline.id} className="bg-surface rounded-lg p-5">
                                            <h3 className="text-lg font-medium mb-4">{storyline.title}</h3>
                                            <ul className="space-y-2">
                                                {missionIds.map((missionId) => {
                                                    const def = MISSION_MAP[missionId];
                                                    const name = def?.name ?? missionId;
                                                    const isUnlocked = unlocked.has(missionId);
                                                    const hasVictory = hasVictoryResult(missionId, missionResults);
                                                    return (
                                                        <li key={missionId}>
                                                            <button
                                                                type="button"
                                                                className="w-full text-left px-4 py-3 rounded border transition-all flex items-center justify-between gap-3 bg-surface-light border-border-custom hover:border-primary hover:bg-surface disabled:opacity-70 disabled:cursor-wait"
                                                                disabled={selectingMission || !isUnlocked}
                                                                onClick={() => handleMissionClick(missionId)}
                                                                title={!isUnlocked ? 'Complete the previous mission to unlock' : undefined}
                                                            >
                                                                <span className="flex items-center gap-2">
                                                                    {!isUnlocked && (
                                                                        <svg className="w-5 h-5 flex-shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                        </svg>
                                                                    )}
                                                                    {name}
                                                                </span>
                                                                {hasVictory && (
                                                                    <span className="flex-shrink-0 text-success" aria-hidden>
                                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                                {missionIds.length === 0 && (
                                                    <li className="text-sm text-muted">No missions available yet.</li>
                                                )}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'join_mission' && (
                            <div className="bg-surface rounded-lg p-6">
                                <h2 className="text-lg text-muted mb-4">Join a Lobby</h2>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted mb-3"
                                    placeholder="Enter lobby code"
                                    maxLength={6}
                                    value={lobbyCode}
                                    onChange={(e) => setLobbyCode(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                                />
                                <button
                                    className="px-6 py-3 bg-surface-light text-white font-semibold text-base rounded border border-border-custom hover:bg-border-custom transition-colors"
                                    onClick={handleJoinByCode}
                                >
                                    Join by Code
                                </button>
                                <RecentLobbiesList lobbies={recentLobbyInfos} onJoin={onJoinLobby} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {hasCampaign && campaign && (
                <nav className="flex border-t border-border-custom bg-surface" aria-label="Tabs">
                    {visibleTabs.map((id) => {
                        const { label } = TAB_SETTINGS[id];
                        return (
                            <button
                                key={id}
                                type="button"
                                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                                    activeTab === id
                                        ? 'text-primary border-b-2 border-primary'
                                        : 'text-muted hover:text-white border-b-2 border-transparent'
                                }`}
                                onClick={() => setActiveTab(id)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </nav>
            )}
        </div>
    );
}
