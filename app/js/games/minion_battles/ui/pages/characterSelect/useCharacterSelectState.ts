import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerState } from '../../../../../types';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { IBaseMissionDef } from '../../../storylines/BaseMissionDef';
import { fromCampaignCharacterData, type CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../../../character_defs/campaignCharacterTypes';
import { SPECTATOR_ID, getControlGroupId } from '../../../state';

interface UseCharacterSelectStateParams {
    api: MinionBattlesApi;
    playerId: string;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    characterSelectReadyPlayerIds: string[];
    missionId: string;
    campaignId: string;
    missionDef: IBaseMissionDef | null | undefined;
    requiredPlayers: Array<{ playerName: string; characterId: string }>;
    isAdmin: boolean;
}

export function useCharacterSelectState({
    api,
    playerId,
    players,
    characterSelections,
    characterSelectReadyPlayerIds,
    missionId,
    campaignId,
    missionDef,
    requiredPlayers,
    isAdmin,
}: UseCharacterSelectStateParams) {
    const [myCharacters, setMyCharacters] = useState<CampaignCharacter[]>([]);
    const [charactersLoading, setCharactersLoading] = useState(true);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const [createCardRef, setCreateCardRef] = useState<HTMLDivElement | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorForceEditable, setEditorForceEditable] = useState(false);
    const [activeTab, setActiveTab] = useState<'characters' | 'players' | 'replay'>('characters');
    const [campaign, setCampaign] = useState<import('../../../../../types').CampaignState | null>(null);
    const [setReadyLoading, setSetReadyLoading] = useState(false);
    const [optimisticAmReady, setOptimisticAmReady] = useState(false);
    const [view, setView] = useState<'overview' | 'grid'>('overview');

    const didAutoOpenCreatorForMissionRef = useRef(false);
    const autoSelectAttemptedForMissionRef = useRef(false);

    useEffect(() => {
        didAutoOpenCreatorForMissionRef.current = false;
        autoSelectAttemptedForMissionRef.current = false;
    }, [missionId]);

    useEffect(() => {
        if (!isAdmin && (activeTab === 'players' || activeTab === 'replay')) {
            setActiveTab('characters');
        }
        if (activeTab === 'players' || activeTab === 'replay') {
            setEditorOpen(false);
            setCreatorOpen(false);
        }
    }, [activeTab, isAdmin]);

    useEffect(() => {
        if (!editorOpen || !campaignId) { setCampaign(null); return; }
        let cancelled = false;
        api.getCampaign(campaignId)
            .then((c) => { if (!cancelled) setCampaign(c); })
            .catch(() => { if (!cancelled) setCampaign(null); });
        return () => { cancelled = true; };
    }, [campaignId, editorOpen, api]);

    useEffect(() => {
        let cancelled = false;
        api.getMyCharacters()
            .then((list) => {
                if (cancelled) return;
                setMyCharacters((list as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d)));
            })
            .catch(() => { if (!cancelled) setMyCharacters([]); })
            .finally(() => { if (!cancelled) setCharactersLoading(false); });
        return () => { cancelled = true; };
    }, [api]);

    useEffect(() => {
        if (charactersLoading || myCharacters.length > 0) return;
        if (activeTab === 'players' || editorOpen) return;
        if (didAutoOpenCreatorForMissionRef.current) return;
        didAutoOpenCreatorForMissionRef.current = true;
        setCreatorOpen(true);
    }, [charactersLoading, myCharacters.length, activeTab, editorOpen]);

    const mySelection = characterSelections[playerId] ?? null;
    const allPlayerIds = Object.keys(players);
    const allSelected = allPlayerIds.length > 0 && allPlayerIds.every((pid) => pid in characterSelections);
    const readySet = useMemo(() => new Set(characterSelectReadyPlayerIds), [characterSelectReadyPlayerIds]);

    const resolvedRequiredPlayers = useMemo(
        () => requiredPlayers.map((req) => ({
            ...req,
            connectedPlayer: Object.values(players).find((p) => p.name === req.playerName) ?? null,
        })),
        [requiredPlayers, players],
    );

    const allRequiredPlayersPresent = resolvedRequiredPlayers.every((r) => r.connectedPlayer !== null);
    const allReady = allPlayerIds.length > 0 && allPlayerIds.every((pid) => readySet.has(pid));
    const atLeastOneCharacter = allPlayerIds.some((pid) => {
        const sel = characterSelections[pid];
        return sel != null && sel !== SPECTATOR_ID;
    });
    /** groupId → playerId for NPC-control selections (sorted playerIds, first wins). */
    const controlSelectionsByGroup = useMemo(() => {
        const map: Record<string, string> = {};
        for (const pid of Object.keys(characterSelections).sort()) {
            const groupId = getControlGroupId(characterSelections[pid]);
            if (groupId == null || map[groupId] != null) continue;
            map[groupId] = pid;
        }
        return map;
    }, [characterSelections]);
    const amReady = readySet.has(playerId);
    const effectivelyReady = amReady || optimisticAmReady;

    const missionTraitFilter = useMemo(
        () => missionDef
            ? { allowedTraits: missionDef.allowedTraits, disallowedTraits: missionDef.disallowedTraits }
            : undefined,
        [missionDef],
    );

    const sortedCharacters = useMemo(() => [...myCharacters].sort((a, b) => {
        if (b.lastUsed !== a.lastUsed) return b.lastUsed - a.lastUsed;
        const aOk = a.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
        const bOk = b.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return 0;
    }), [myCharacters, campaignId, missionId, missionTraitFilter]);

    const myRequiredEntry = useMemo(
        () => resolvedRequiredPlayers.find((r) => r.connectedPlayer?.id === playerId) ?? null,
        [resolvedRequiredPlayers, playerId],
    );
    const myLockedCharacterId = myRequiredEntry?.characterId ?? null;

    const characterToEdit = useMemo(
        () => (mySelection ? myCharacters.find((c) => c.id === mySelection) ?? null : null),
        [mySelection, myCharacters],
    );

    return {
        myCharacters, setMyCharacters,
        charactersLoading,
        creatorOpen, setCreatorOpen,
        createCardRef, setCreateCardRef,
        editorOpen, setEditorOpen,
        editorForceEditable, setEditorForceEditable,
        activeTab, setActiveTab,
        campaign,
        setReadyLoading, setSetReadyLoading,
        optimisticAmReady, setOptimisticAmReady,
        view, setView,
        didAutoOpenCreatorForMissionRef,
        autoSelectAttemptedForMissionRef,
        mySelection,
        allPlayerIds,
        allSelected,
        readySet,
        resolvedRequiredPlayers,
        allRequiredPlayersPresent,
        allReady,
        atLeastOneCharacter,
        controlSelectionsByGroup,
        amReady,
        effectivelyReady,
        missionTraitFilter,
        sortedCharacters,
        myLockedCharacterId,
        characterToEdit,
    };
}

export type CharacterSelectState = ReturnType<typeof useCharacterSelectState>;
