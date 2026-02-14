/**
 * Character definition shape.
 * Each character has an ID, name, picture (SVG string), enabled flag, and a list of card IDs.
 */
export interface CharacterDef {
    id: string;
    name: string;
    /** SVG string or image URL for the character portrait */
    picture: string;
    /** Whether this character is currently enabled for selection */
    enabled: boolean;
    /** List of card IDs this character has access to (referential only, not displayed) */
    cards: string[];
}
