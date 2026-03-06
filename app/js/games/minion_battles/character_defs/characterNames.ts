/**
 * Pool of 40 character names. One is chosen at random when creating a new character.
 */
export const CHARACTER_NAMES: readonly string[] = [
    'Aldric',
    'Aria',
    'Bram',
    'Coral',
    'Dax',
    'Elara',
    'Finn',
    'Gwen',
    'Hugo',
    'Ivy',
    'Jasper',
    'Kira',
    'Leo',
    'Mira',
    'Nolan',
    'Orin',
    'Piper',
    'Quinn',
    'Raven',
    'Sage',
    'Tobin',
    'Uma',
    'Vance',
    'Willow',
    'Xander',
    'Yara',
    'Zephyr',
    'Ash',
    'Blair',
    'Cove',
    'Dusk',
    'Ember',
    'Flint',
    'Gale',
    'Haven',
    'Jade',
    'Kestrel',
    'Luna',
    'Moss',
    'Nova',
];

/**
 * Returns a random character name from the pool.
 */
export function getRandomCharacterName(): string {
    const index = Math.floor(Math.random() * CHARACTER_NAMES.length);
    return CHARACTER_NAMES[index];
}
