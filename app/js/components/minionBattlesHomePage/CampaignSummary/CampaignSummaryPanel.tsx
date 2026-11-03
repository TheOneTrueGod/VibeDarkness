/**
 * Admin Campaign Summary: every player down the left (favourite heart, colour, tracked
 * character) and a mission map in the centre with a facepile of tracked characters above
 * the missions they are currently at. Clicking a mission hosts a lobby for it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Heart } from 'lucide-react';
import type { AccountState, CampaignState } from '../../../types';
import type { LobbyClient } from '../../../LobbyClient';
import type { CampaignCharacterData } from '../../../games/minion_battles/character_defs/campaignCharacterTypes';
import {
    fromCampaignCharacterData,
    type CampaignCharacter,
} from '../../../games/minion_battles/character_defs/CampaignCharacter';
import { getPortrait } from '../../../games/minion_battles/character_defs/portraits';
import { STORYLINES } from '../../../games/minion_battles/storylines';
import { getCampaignChapters } from '../../../games/minion_battles/storylines/unlock';
import MissionMapCanvas from '../../../games/minion_battles/ui/components/CharacterEditor/MissionMap/MissionMapCanvas';
import { buildMissionMapLayout } from '../../../games/minion_battles/ui/components/CharacterEditor/MissionMap/missionMapLayout';
import { chapterBtnClass } from '../../../games/minion_battles/ui/components/CharacterEditor/MissionMap/missionMapHelpers';
import PanelLayout from '../PanelLayout';
import MissionFacepiles, { FACEPILE_HEADROOM, type SummaryFace } from './MissionFacepiles';
import {
    assignPlayerColors,
    defaultTrackedCharacterId,
    formatLastLogin,
    getMissionsCharacterIsAt,
    sortSummaryAccounts,
} from './campaignSummary';

interface Props {
    campaign: CampaignState;
    lobbyClient: LobbyClient;
    onSelectMission: (missionId: string, campaignId: string | null) => Promise<boolean>;
}

const NO_FACES = new Map<string, SummaryFace[]>();

export default function CampaignSummaryPanel({ campaign, lobbyClient, onSelectMission }: Props) {
    const [accounts, setAccounts] = useState<AccountState[]>([]);
    const [charactersByAccount, setCharactersByAccount] = useState<Map<number, CampaignCharacter[]>>(new Map());
    const [loading, setLoading] = useState(false);
    const [trackedOnly, setTrackedOnly] = useState<boolean | null>(null);
    const [hoveredAccountId, setHoveredAccountId] = useState<number | null>(null);
    const [hoveredMissionId, setHoveredMissionId] = useState<string | null>(null);
    const [pressedMissionId, setPressedMissionId] = useState<string | null>(null);
    const [storylineId, setStorylineId] = useState<string | null>(null);
    const [chapterIndex, setChapterIndex] = useState<number | null>(null);
    const [hosting, setHosting] = useState(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = (await lobbyClient.listAdminAccounts()) as AccountState[];
            const details = await Promise.all(
                list.map(async (account) => {
                    try {
                        const res = await lobbyClient.getAdminAccountDetails(account.id);
                        const chars = (res.characters as unknown as CampaignCharacterData[]).map(fromCampaignCharacterData);
                        return [account.id, chars] as const;
                    } catch (error) {
                        console.error(`Failed to load characters for account ${account.id}:`, error);
                        return [account.id, [] as CampaignCharacter[]] as const;
                    }
                }),
            );
            setAccounts(list);
            setCharactersByAccount(new Map(details));
        } catch (error) {
            console.error('Failed to load campaign summary:', error);
            setAccounts([]);
            setCharactersByAccount(new Map());
        } finally {
            setLoading(false);
        }
    }, [lobbyClient]);

    useEffect(() => {
        void load();
    }, [load]);

    const sortedAccounts = useMemo(() => sortSummaryAccounts(accounts), [accounts]);
    const colorByAccount = useMemo(() => assignPlayerColors(accounts), [accounts]);
    const anyFavorite = accounts.some((a) => a.adminFavorite);
    // Until the admin picks, show only tracked players when any are tracked.
    const showTrackedOnly = trackedOnly ?? anyFavorite;

    const trackedCharacterByAccount = useMemo(() => {
        const m = new Map<number, CampaignCharacter>();
        for (const account of accounts) {
            const chars = charactersByAccount.get(account.id) ?? [];
            const id = defaultTrackedCharacterId(account, chars);
            const character = chars.find((c) => c.id === id);
            if (character) m.set(account.id, character);
        }
        return m;
    }, [accounts, charactersByAccount]);

    const mapAccounts = useMemo(
        () => sortedAccounts.filter((a) => !showTrackedOnly || a.adminFavorite),
        [sortedAccounts, showTrackedOnly],
    );

    // Default to the storyline most mapped characters are on.
    const resolvedStorylineId = useMemo(() => {
        if (storylineId) return storylineId;
        const counts = new Map<string, number>();
        for (const a of mapAccounts) {
            const c = trackedCharacterByAccount.get(a.id);
            if (c) counts.set(c.campaignId, (counts.get(c.campaignId) ?? 0) + 1);
        }
        let best = STORYLINES[0]?.id ?? null;
        let bestCount = 0;
        for (const s of STORYLINES) {
            const n = counts.get(s.id) ?? 0;
            if (n > bestCount) { best = s.id; bestCount = n; }
        }
        return best;
    }, [storylineId, mapAccounts, trackedCharacterByAccount]);

    const storyline = useMemo(
        () => STORYLINES.find((s) => s.id === resolvedStorylineId) ?? null,
        [resolvedStorylineId],
    );
    const chapters = useMemo(() => (storyline ? getCampaignChapters(storyline, { isAdmin: true }) : []), [storyline]);

    /** Mission id → faces of mapped characters at that mission, in list order. */
    const facesByMission = useMemo(() => {
        if (!storyline) return NO_FACES;
        const m = new Map<string, SummaryFace[]>();
        for (const account of mapAccounts) {
            const character = trackedCharacterByAccount.get(account.id);
            if (!character) continue;
            const face: SummaryFace = {
                accountId: account.id,
                playerName: account.name,
                characterName: character.name,
                picture: getPortrait(character.portraitId)?.picture,
                color: colorByAccount.get(account.id) ?? '#a1a1aa',
            };
            for (const missionId of getMissionsCharacterIsAt(storyline, character)) {
                const list = m.get(missionId) ?? [];
                list.push(face);
                m.set(missionId, list);
            }
        }
        return m;
    }, [storyline, mapAccounts, trackedCharacterByAccount, colorByAccount]);

    const facesPerChapter = useMemo(
        () => chapters.map((ch) => new Set(ch.missionIds.flatMap((id) => (facesByMission.get(id) ?? []).map((f) => f.accountId))).size),
        [chapters, facesByMission],
    );

    // Default to the furthest chapter anyone mapped is in.
    const resolvedChapterIndex = useMemo(() => {
        if (chapterIndex != null && chapterIndex < chapters.length) return chapterIndex;
        for (let i = facesPerChapter.length - 1; i >= 0; i--) {
            if (facesPerChapter[i] > 0) return i;
        }
        return Math.max(0, chapters.findIndex((c) => !c.adminOnly));
    }, [chapterIndex, chapters, facesPerChapter]);
    const activeChapter = chapters[resolvedChapterIndex] ?? null;

    const layout = useMemo(
        () => (storyline ? buildMissionMapLayout(storyline, chapters, activeChapter, true) : null),
        [storyline, chapters, activeChapter],
    );
    // Every node is clickable on the summary; completion styling belongs to individual characters.
    const allMissionIds = useMemo(() => new Set(layout?.missions.map((m) => m.id) ?? []), [layout]);
    const emptySet = useMemo(() => new Set<string>(), []);

    const updateAccount = useCallback((updated: AccountState) => {
        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
    }, []);

    const toggleFavorite = useCallback(async (account: AccountState) => {
        const next = !account.adminFavorite;
        updateAccount({ ...account, adminFavorite: next });
        try {
            updateAccount((await lobbyClient.setAdminFavorite(account.id, { favorite: next })) as AccountState);
        } catch (error) {
            console.error('Failed to update favourite:', error);
            updateAccount({ ...account, adminFavorite: !next });
        }
    }, [lobbyClient, updateAccount]);

    const selectCharacter = useCallback(async (account: AccountState, characterId: string) => {
        const previous = account.adminFavoriteCharacterId ?? null;
        updateAccount({ ...account, adminFavoriteCharacterId: characterId });
        try {
            updateAccount((await lobbyClient.setAdminFavorite(account.id, { characterId })) as AccountState);
        } catch (error) {
            console.error('Failed to update tracked character:', error);
            updateAccount({ ...account, adminFavoriteCharacterId: previous });
        }
    }, [lobbyClient, updateAccount]);

    const handleMissionClick = useCallback(async (missionId: string) => {
        if (hosting) return;
        setHosting(true);
        try {
            await onSelectMission(missionId, campaign.id ?? null);
        } finally {
            setHosting(false);
        }
    }, [hosting, onSelectMission, campaign.id]);

    const left = (
        <ul className="p-3 space-y-2">
            {loading && accounts.length === 0 && <li className="text-sm text-muted">Loading players…</li>}
            {!loading && accounts.length === 0 && <li className="text-sm text-muted">No players found</li>}
            {sortedAccounts.map((account) => {
                const color = colorByAccount.get(account.id) ?? '#a1a1aa';
                const chars = charactersByAccount.get(account.id) ?? [];
                const tracked = trackedCharacterByAccount.get(account.id) ?? null;
                const highlighted = hoveredAccountId === account.id;
                const onMap = !showTrackedOnly || account.adminFavorite;
                return (
                    <li
                        key={account.id}
                        onMouseEnter={() => setHoveredAccountId(account.id)}
                        onMouseLeave={() => setHoveredAccountId(null)}
                        className={`rounded-lg border-2 px-3 py-2 transition-all ${onMap ? '' : 'opacity-60'} ${highlighted ? 'scale-[1.02]' : ''}`}
                        style={{
                            backgroundColor: `${color}${highlighted ? '55' : '26'}`,
                            borderColor: highlighted ? color : `${color}66`,
                            boxShadow: highlighted ? `0 0 10px ${color}88` : undefined,
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void toggleFavorite(account)}
                                className="shrink-0 text-rose-400 hover:text-rose-300"
                                title={account.adminFavorite ? 'Stop tracking this player' : 'Track this player'}
                                aria-pressed={!!account.adminFavorite}
                            >
                                <Heart className="h-4 w-4" fill={account.adminFavorite ? 'currentColor' : 'none'} aria-hidden />
                            </button>
                            <span className="min-w-0 flex-1 truncate font-semibold text-white">{account.name}</span>
                            <span className="shrink-0 text-[10px] text-zinc-300" title="Last login">
                                {formatLastLogin(account.lastLoginAt, nowSeconds)}
                            </span>
                        </div>
                        <div className="relative mt-1.5">
                            <select
                                value={tracked?.id ?? ''}
                                disabled={chars.length === 0}
                                onChange={(e) => void selectCharacter(account, e.target.value)}
                                className="w-full appearance-none text-xs bg-surface/80 border border-border-custom rounded pl-2 pr-7 py-1 text-white disabled:opacity-60"
                            >
                                {chars.length === 0 && <option value="">No characters</option>}
                                {chars.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}{c.campaignId !== resolvedStorylineId ? ` (${STORYLINES.find((s) => s.id === c.campaignId)?.title ?? c.campaignId})` : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white" aria-hidden />
                        </div>
                    </li>
                );
            })}
        </ul>
    );

    const center = !storyline || !layout ? (
        <div className="flex h-full items-center justify-center text-sm text-muted">No campaigns defined.</div>
    ) : (
        <div className="h-full w-full overflow-auto p-3">
            <div className="flex items-center gap-3 pb-2 border-b border-border-custom mb-2">
                <div className="flex-1 min-w-0">
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={showTrackedOnly}
                            onChange={(e) => setTrackedOnly(e.target.checked)}
                        />
                        Tracked players only
                    </label>
                </div>
                {chapters.length > 0 && (
                    <div className="shrink-0 flex items-center gap-2" role="tablist" aria-label="Campaign chapters">
                        {chapters.map((ch, i) => (
                            <button
                                key={ch.id}
                                type="button"
                                role="tab"
                                aria-selected={i === resolvedChapterIndex}
                                title={`${ch.title ?? `Chapter ${ch.numeral}`}${facesPerChapter[i] ? ` — ${facesPerChapter[i]} player(s)` : ''}`}
                                onClick={() => setChapterIndex(i)}
                                className={`relative ${chapterBtnClass(i === resolvedChapterIndex, true, true)}`}
                            >
                                {ch.numeral}
                                {facesPerChapter[i] > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-[10px] leading-4 text-white">
                                        {facesPerChapter[i]}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex-1 min-w-0 flex justify-end">
                    <div className="relative w-44 max-w-[40vw]">
                        <select
                            value={storyline.id}
                            onChange={(e) => { setStorylineId(e.target.value); setChapterIndex(null); }}
                            className="w-full appearance-none text-xs bg-surface border border-border-custom rounded pl-2 pr-7 py-1 text-white"
                        >
                            {STORYLINES.map((s) => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                            ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white" aria-hidden />
                    </div>
                </div>
            </div>
            <MissionMapCanvas
                svgRef={svgRef}
                storyline={storyline}
                isAdmin
                viewBox={{
                    ...layout.viewBox,
                    vbY: layout.viewBox.vbY - FACEPILE_HEADROOM,
                    vbH: layout.viewBox.vbH + FACEPILE_HEADROOM,
                }}
                mapDividers={layout.mapDividers}
                missions={layout.missions}
                questBanksOnMap={layout.questBanksOnMap}
                posMap={layout.posMap}
                completedNodeKeys={emptySet}
                unlockedIds={allMissionIds}
                missionResults={[]}
                questResults={[]}
                hoveredId={hoveredMissionId}
                pressedId={pressedMissionId}
                tooltip={null}
                bankTooltip={null}
                setHoveredId={setHoveredMissionId}
                setPressedId={setPressedMissionId}
                onNodeClick={(id) => void handleMissionClick(id)}
                onNodeEnter={(id) => setHoveredMissionId(id)}
                onNodeLeave={(id) => {
                    setHoveredMissionId((h) => (h === id ? null : h));
                    setPressedMissionId((p) => (p === id ? null : p));
                }}
                onQuestBankClick={() => {}}
                overlay={
                    <MissionFacepiles
                        missions={layout.missions}
                        facesByMission={facesByMission}
                        hoveredAccountId={hoveredAccountId}
                        onHoverAccount={setHoveredAccountId}
                    />
                }
            />
            {hosting && <div className="mt-2 text-center text-xs text-muted">Hosting lobby…</div>}
        </div>
    );

    return (
        <PanelLayout
            title="Campaign Summary"
            subtitle="Where every tracked player is in the campaign. Click a mission to host it."
            actions={
                <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom disabled:opacity-60"
                    disabled={loading}
                >
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            }
            left={left}
            leftSize="medium"
            center={center}
            centerClassName="overflow-hidden"
        />
    );
}
