import type { CharacterInnerTabId } from '../../ability-tests/campaignTabPaths';

/** CharacterEditor's local tab ids (lobby + leftover internal state). */
export type CharacterEditorTab = 'missionMap' | 'equipment' | 'research' | 'statBonuses';

export function editorTabFromInner(tab: CharacterInnerTabId): CharacterEditorTab {
    switch (tab) {
        case 'map':
            return 'missionMap';
        case 'upgrades':
            return 'research';
        case 'bonuses':
            return 'statBonuses';
        case 'equipment':
            return 'equipment';
        default:
            return 'missionMap';
    }
}

export function innerTabFromEditor(tab: CharacterEditorTab): CharacterInnerTabId {
    switch (tab) {
        case 'missionMap':
            return 'map';
        case 'research':
            return 'upgrades';
        case 'statBonuses':
            return 'bonuses';
        case 'equipment':
            return 'equipment';
        default:
            return 'map';
    }
}

const CHANGE_CHARACTERS_TABS: ReadonlySet<CharacterInnerTabId> = new Set(['map', 'upgrades', 'bonuses']);

export function innerTabShowsChangeCharacters(tab: CharacterInnerTabId): boolean {
    return CHANGE_CHARACTERS_TABS.has(tab);
}

export function innerTabShowsPortrait(tab: CharacterInnerTabId): boolean {
    return tab !== 'upgrades';
}
