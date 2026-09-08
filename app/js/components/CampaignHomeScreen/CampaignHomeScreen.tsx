/**
 * Campaign home — tabbed view. Tab chrome and panels live in sibling files;
 * this screen owns campaign bootstrap, URL routing, and the tab bar.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { LobbyClient } from '../../LobbyClient';
import { useUserData } from '../../user/UserDataProvider';
import { useCurrentUser } from '../../user/useCurrentUser';
import type { CampaignState } from '../../types';
import { MinionBattlesApi } from '../../games/minion_battles/api/minionBattlesApi';
import {
    type TabId,
    tabFromCampaignSlug,
    campaignPathForTab,
    playerCharactersPath,
} from '../ability-tests/campaignTabPaths';
import { TestIds, campaignTabTestId } from '../../testing/testIds';
import { CAMPAIGN_HOME_TABS, getCampaignHomeTab } from './campaignHomeTabs';
import { CAMPAIGN_HOME_CARD_MAX_WIDTH_CLASS } from './CampaignHomeTabFrame';
import CampaignHomeHeader from './CampaignHomeHeader';

/** Default tab when no tab is selected. */
function getDefaultTab(_isAdmin: boolean): TabId {
    return 'characters';
}

interface CampaignHomeScreenProps {
    lobbyClient: LobbyClient;
    onSelectMission: (missionId: string, campaignId: string | null) => Promise<boolean>;
    onJoinLobby: (lobbyId: string) => Promise<void>;
    refetchUser: () => Promise<void>;
    onStartMissionForCharacter?: (
        missionId: string,
        character: import('../../games/minion_battles/character_defs/CampaignCharacter').CampaignCharacter,
        ownerAccount: import('../../types').AccountState,
    ) => void;
    /** Start / continue a quest run (Mission Map banks + Quest Prep). */
    onStartQuestForCharacter?: (
        questDefId: string,
        character: import('../../games/minion_battles/character_defs/CampaignCharacter').CampaignCharacter,
        ownerAccount: import('../../types').AccountState,
        options?: {
            mode?: 'continue' | 'start';
            assignedBankId?: string | null;
            adminSeekSlotIndex?: number;
        },
    ) => void;
}

function pathForTab(id: TabId, userId: number | string): string {
    const tab = getCampaignHomeTab(id);
    return tab.getPath?.(userId) ?? campaignPathForTab(id);
}

export default function CampaignHomeScreen({
    lobbyClient,
    onSelectMission,
    onJoinLobby,
    refetchUser,
    onStartMissionForCharacter,
    onStartQuestForCharacter,
}: CampaignHomeScreenProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { tabSlug } = useParams<{ tabSlug: string }>();
    const { user } = useUserData();
    const { isAdmin } = useCurrentUser();
    const defaultTab = getDefaultTab(isAdmin);
    const visibleTabs = useMemo(
        () => CAMPAIGN_HOME_TABS.filter((tab) => tab.isVisible(isAdmin)),
        [isAdmin]
    );
    const onPlayersListRoute = location.pathname === '/players';
    const onCharactersRoute = location.pathname.startsWith('/players/');
    const activeTab: TabId = onPlayersListRoute ? 'players' : onCharactersRoute ? 'characters' : (tabFromCampaignSlug(tabSlug) ?? defaultTab);
    const activeTabDef = getCampaignHomeTab(activeTab);

    useEffect(() => {
        if (onCharactersRoute) return;
        if (onPlayersListRoute) {
            if (!isAdmin) {
                navigate(playerCharactersPath(user?.id ?? ''), { replace: true });
            }
            return;
        }
        const fromUrl = tabFromCampaignSlug(tabSlug);
        if (fromUrl != null && visibleTabs.some((tab) => tab.id === fromUrl)) {
            return;
        }
        const fallback =
            (visibleTabs.some((tab) => tab.id === defaultTab) ? defaultTab : visibleTabs[0]?.id) ?? 'welcome';
        if (fallback === 'characters') {
            navigate(playerCharactersPath(user?.id ?? ''), { replace: true });
        } else {
            navigate(pathForTab(fallback, user?.id ?? ''), { replace: true });
        }
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
            <div className="mx-auto w-full px-5 py-2 max-md:px-5 max-md:py-5 max-w-full">
                <div className={`mx-auto w-full ${CAMPAIGN_HOME_CARD_MAX_WIDTH_CLASS}`}>
                    <CampaignHomeHeader />

                {!hasCampaign && bootstrappingCampaign && (
                    <div className="bg-surface rounded-lg p-6 mb-6 text-center text-muted">
                        Preparing your campaign…
                    </div>
                )}

                {hasCampaign && campaignLoading && (
                    <div className="text-center text-muted py-8">Loading campaign…</div>
                )}

                {hasCampaign && !campaignLoading && campaign && activeTabDef.render({
                    campaign,
                    lobbyClient,
                    api,
                    onSelectMission,
                    onJoinLobby,
                    onCampaignUpdated: setCampaign,
                    onStartMissionForCharacter,
                    onStartQuestForCharacter,
                })}
                </div>
            </div>
            </div>

            {hasCampaign && campaign && (
                <nav className="flex border-t border-border-custom bg-surface" aria-label="Tabs" data-testid={TestIds.campaignTabs}>
                    {visibleTabs.map((tab) => {
                        const { id, label, adminTab } = tab;
                        const isActive = activeTab === id;
                        return (
                            <button
                                key={id}
                                type="button"
                                data-testid={campaignTabTestId(id)}
                                className={`flex-1 py-4 text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'text-primary border-b-2 border-primary'
                                        : 'text-muted hover:text-white border-b-2 border-transparent'
                                } ${adminTab ? 'bg-red-950/50 hover:bg-red-950/70' : ''}`}
                                onClick={() => navigate(pathForTab(id, user?.id ?? ''))}
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
