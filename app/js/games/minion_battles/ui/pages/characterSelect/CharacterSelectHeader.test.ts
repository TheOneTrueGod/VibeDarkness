import { describe, expect, it } from 'vitest';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getCharacterSelectPhaseTitle } from './CharacterSelectHeader';

const character = { id: 'c1' } as CampaignCharacter;
const base = {
    activeTab: 'characters' as const,
    isAdmin: false,
    editorOpen: false,
    characterToEdit: character,
    view: 'overview' as const,
};

describe('getCharacterSelectPhaseTitle', () => {
    it('calls the loadout overview "Prepare"', () => {
        expect(getCharacterSelectPhaseTitle(base)).toBe('Prepare');
    });

    it('names the Edit Character and Edit Modifiers sub-views', () => {
        expect(getCharacterSelectPhaseTitle({ ...base, editorOpen: true })).toBe('Edit Character');
        expect(getCharacterSelectPhaseTitle({ ...base, modifiersOpen: true })).toBe('Edit Modifiers');
    });

    it('shows the character picker title on the grid', () => {
        expect(getCharacterSelectPhaseTitle({ ...base, view: 'grid', modifiersOpen: true })).toBe(
            'Select your character',
        );
    });
});
