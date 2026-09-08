import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    DEFAULT_CHARACTER_INNER_TAB,
    playerCharacterPath,
    tabFromCharacterInnerSlug,
    type CharacterInnerTabId,
} from '../../ability-tests/campaignTabPaths';

/** Reads `/players/:id/characters/:charId/:characterTab` and defaults a missing/invalid tab to map. */
export function useCharacterInnerTab(): {
    tab: CharacterInnerTabId;
    setTab: (tab: CharacterInnerTabId) => void;
} {
    const navigate = useNavigate();
    const { playerId, characterId, characterTab } = useParams<{
        playerId: string;
        characterId: string;
        characterTab?: string;
    }>();
    const tab = tabFromCharacterInnerSlug(characterTab) ?? DEFAULT_CHARACTER_INNER_TAB;

    useEffect(() => {
        if (playerId == null || characterId == null) return;
        const fromUrl = tabFromCharacterInnerSlug(characterTab);
        if (fromUrl != null) return;
        navigate(playerCharacterPath(playerId, characterId, DEFAULT_CHARACTER_INNER_TAB), { replace: true });
    }, [playerId, characterId, characterTab, navigate]);

    const setTab = useCallback((next: CharacterInnerTabId) => {
        if (playerId == null || characterId == null) return;
        navigate(playerCharacterPath(playerId, characterId, next));
    }, [playerId, characterId, navigate]);

    return { tab, setTab };
}
