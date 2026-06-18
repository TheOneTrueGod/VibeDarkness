/**
 * Campaign home - tabbed view: Welcome, Mission Select, Join Mission.
 * Shown when user is logged in and on the lobby screen (no active lobby).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { LobbyClient } from '../LobbyClient';
import { useUser } from '../contexts/UserContext';
import type { CampaignState } from '../types';
import AdminPlayersHomePanel from './minionBattlesHomePage/AdminPlayersHomePanel';
import CharactersPanel from '../games/minion_battles/ui/components/characters/CharactersPanel';
import { MinionBattlesApi } from '../games/minion_battles/api/minionBattlesApi';
import AbilityTestPanel from './minionBattlesHomePage/AbilityTestPanel';
import MissionSelectPanel from './minionBattlesHomePage/MissionSelectPanel';
import JoinMissionPanel from './minionBattlesHomePage/JoinMissionPanel';
import TerrainEditorTab from './minionBattlesHomePage/TerrainEditor/TerrainEditorTab';
import LobbyArchiveTab from './minionBattlesHomePage/LobbyArchive/LobbyArchiveTab';
import BestiaryPanel from './minionBattlesHomePage/BestiaryPanel';
import {
    type TabId,
    CAMPAIGN_TAB_IDS,
    tabFromCampaignSlug,
    campaignPathForTab,
    playersListPath,
    playerCharactersPath,
} from './ability-tests/campaignTabPaths';

/** Per-tab settings: label and whether the tab is visible for the current user. */
const TAB_SETTINGS: Record<
    TabId,
    { label: string; isVisible: (isAdmin: boolean) => boolean; adminTab?: boolean }
> = {
    welcome: { label: 'Welcome', isVisible: () => true },
    mission_select: { label: 'Mission Select', isVisible: (isAdmin) => isAdmin, adminTab: true },
    join_mission: { label: 'Join Mission', isVisible: () => true },
    players: { label: 'Players', isVisible: (isAdmin) => isAdmin, adminTab: true },
    characters: { label: 'Characters', isVisible: () => true },
    ability_test: { label: 'Ability Test', isVisible: (isAdmin) => isAdmin, adminTab: true },
    terrain_editor: { label: 'Terrain Editor', isVisible: (isAdmin) => isAdmin, adminTab: true },
    lobby_archive: { label: 'Lobby Archive', isVisible: (isAdmin) => isAdmin, adminTab: true },
    bestiary: { label: 'Bestiary', isVisible: (isAdmin) => isAdmin, adminTab: true },
};

/** Default tab when no tab is selected; non-admins see Join Mission first. */
function getDefaultTab(isAdmin: boolean): TabId {
    return isAdmin ? 'mission_select' : 'join_mission';
}

interface CampaignHomeScreenProps {
    lobbyClient: LobbyClient;
    onSelectMission: (missionId: string, campaignId: string | null) => Promise<boolean>;
    onJoinLobby: (lobbyId: string) => Promise<void>;
    refetchUser: () => Promise<void>;
    onStartMissionForCharacter?: (
        missionId: string,
        character: import('../games/minion_battles/character_defs/CampaignCharacter').CampaignCharacter,
        ownerAccount: import('../types').AccountState,
    ) => void;
}

export default function CampaignHomeScreen({
    lobbyClient,
    onSelectMission,
    onJoinLobby,
    refetchUser,
    onStartMissionForCharacter,
}: CampaignHomeScreenProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { tabSlug } = useParams<{ tabSlug: string }>();
    const { user, role } = useUser();
    const isAdmin = role === 'admin';
    const defaultTab = getDefaultTab(isAdmin);
    const visibleTabs = useMemo(
        () => CAMPAIGN_TAB_IDS.filter((id) => TAB_SETTINGS[id].isVisible(isAdmin)),
        [isAdmin]
    );
    const onPlayersListRoute = location.pathname === '/players';
    const onCharactersRoute = location.pathname.startsWith('/players/');
    const activeTab: TabId = onPlayersListRoute ? 'players' : onCharactersRoute ? 'characters' : (tabFromCampaignSlug(tabSlug) ?? defaultTab);

    useEffect(() => {
        if (onCharactersRoute) return;
        if (onPlayersListRoute) {
            if (!isAdmin) {
                navigate(playerCharactersPath(user?.id ?? ''), { replace: true });
            }
            return;
        }
        const fromUrl = tabFromCampaignSlug(tabSlug);
        if (fromUrl != null && visibleTabs.includes(fromUrl)) {
            return;
        }
        const fallback =
            (visibleTabs.includes(defaultTab) ? defaultTab : visibleTabs[0]) ?? 'welcome';
        navigate(campaignPathForTab(fallback), { replace: true });
    }, [tabSlug, visibleTabs, defaultTab, navigate, onPlayersListRoute, onCharactersRoute, isAdmin, user]);
    const api = useMemo(() => new MinionBattlesApi(lobbyClient, '', '', ''), [lobbyClient]);
    const [campaign, setCampaign] = useState<CampaignState | null>(null);
    const [campaignLoading, setCampaignLoading] = useState(false);
    const [bootstrappingCampaign, setBootstrappingCampaign] = useState(false);

    const campaignIds = user?.campaignIds ?? [];
    const hasCampaign = campaignIds.length > 0;
    const primaryCampaignId = campaignIds[0];

    // Load first campaign when user has campaignIds
    useEffect(() => {
        if (!hasCampaign || primaryCampaignId == null) {
            setCampaign(null);
            return;
        }
        let cancelled = false;
        setCampaignLoading(true);
        lobbyClient
            .getCampaign(primaryCampaignId)
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
    }, [hasCampaign, primaryCampaignId, lobbyClient]);

    /** Legacy accounts without campaigns: create one silently once (sessionStorage avoids Strict Mode double-create). */
    useEffect(() => {
        if (user == null || hasCampaign) {
            return;
        }
        const key = `campaignBootstrap:${user.id}`;
        try {
            if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) {
                return;
            }
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(key, '1');
            }
        } catch {
            /* unavailable storage — still attempt one create; rare duplicate risk in Strict Mode */
        }
        setBootstrappingCampaign(true);
        lobbyClient
            .createCampaign()
            .then(() => refetchUser())
            .catch(() => {
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem(key);
                    }
                } catch {
                    /* ignore */
                }
            })
            .finally(() => {
                setBootstrappingCampaign(false);
            });
    }, [user, hasCampaign, lobbyClient, refetchUser]);

    return (
        <div className="h-screen flex flex-col">
            <div className="flex-1 overflow-y-auto w-full">
            <div
                className={`mx-auto w-full px-5 py-8 max-md:px-5 max-md:py-5 ${
                    activeTab === 'welcome' ? 'max-w-[800px]' : 'max-w-full'
                }`}
            >
                <h1 className="text-center text-4xl max-md:text-3xl font-bold mb-8 text-primary">
                    Minion Battles
                </h1>

                {!hasCampaign && bootstrappingCampaign && (
                    <div className="bg-surface rounded-lg p-6 mb-6 text-center text-muted">
                        Preparing your campaign…
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
                            <MissionSelectPanel
                                campaign={campaign}
                                isAdmin={isAdmin}
                                lobbyClient={lobbyClient}
                                onSelectMission={onSelectMission}
                                onCampaignUpdated={setCampaign}
                            />
                        )}

                        {activeTab === 'join_mission' && (
                            <JoinMissionPanel
                                lobbyClient={lobbyClient}
                                onJoinLobby={onJoinLobby}
                            />
                        )}

                        {activeTab === 'players' && isAdmin && (
                            <AdminPlayersHomePanel
                                lobbyClient={lobbyClient}
                            />
                        )}

                        {activeTab === 'characters' && (
                            <CharactersPanel
                                api={api}
                                lobbyClient={lobbyClient}
                                onStartMissionForCharacter={onStartMissionForCharacter}
                            />
                        )}

                        {activeTab === 'ability_test' && isAdmin && <AbilityTestPanel />}

                        {activeTab === 'terrain_editor' && isAdmin && <TerrainEditorTab />}

                        {activeTab === 'lobby_archive' && isAdmin && (
                            <LobbyArchiveTab lobbyClient={lobbyClient} onJoinLobby={onJoinLobby} />
                        )}

                        {activeTab === 'bestiary' && isAdmin && <BestiaryPanel />}
                    </>
                )}
            </div>
            </div>

            {hasCampaign && campaign && (
                <nav className="flex border-t border-border-custom bg-surface" aria-label="Tabs">
                    {visibleTabs.map((id) => {
                        const { label, adminTab } = TAB_SETTINGS[id];
                        const isActive = activeTab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'text-primary border-b-2 border-primary'
                                        : 'text-muted hover:text-white border-b-2 border-transparent'
                                } ${adminTab ? 'bg-red-950/50 hover:bg-red-950/70' : ''}`}
                                onClick={() => {
                                    if (id === 'players') {
                                        navigate(playersListPath());
                                    } else if (id === 'characters') {
                                        navigate(playerCharactersPath(user?.id ?? ''));
                                    } else {
                                        navigate(campaignPathForTab(id));
                                    }
                                }}
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
