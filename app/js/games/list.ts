/**
 * Registry of available games. Each game has an id (folder name), title, image, description,
 * enabled flag, and entrypoint path (js/games/<id>/game.js).
 */
export interface GameDef {
    id: string;
    title: string;
    image: string;
    description: string;
    enabled: boolean;
}

export const GAMES: GameDef[] = [
    {
        id: 'placeholder_1',
        title: 'Coming Soon',
        image: '',
        description: 'This game is not available yet.',
        enabled: false,
    },
    {
        id: 'placeholder_2',
        title: 'Coming Soon 2',
        image: '',
        description: 'Another game coming soon.',
        enabled: false,
    },
    {
        id: 'minion_battles',
        title: 'Minion Battles',
        image: '',
        description: 'Battle with minions in this multiplayer game.',
        enabled: true,
    },
];

export function getGameById(id: string): GameDef | undefined {
    return GAMES.find((g) => g.id === id);
}
