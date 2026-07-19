/**
 * Stable Playwright / e2e hooks. Prefer these over fragile text selectors.
 * Keep names kebab-case; do not encode display copy into the id.
 */
export const TestIds = {
    loginUsername: 'login-username',
    loginPassword: 'login-password',
    loginSubmit: 'login-submit',
    loginModeToggle: 'login-mode-toggle',
    loginForm: 'login-form',

    campaignTabs: 'campaign-tabs',
    /** Suffix with TabId, e.g. campaign-tab-characters */
    campaignTabPrefix: 'campaign-tab-',

    charactersCreate: 'characters-create',
    charactersLoading: 'characters-loading',
    /** Suffix with character id */
    characterCardPrefix: 'character-card-',
    characterEditorMissionMapTab: 'character-editor-tab-mission-map',
    missionHost: 'mission-host',
    missionMapNodePrefix: 'mission-map-node-',

    characterSelectReady: 'character-select-ready',
    storyNext: 'story-next',
    storyChoicePrefix: 'story-choice-',

    battleWait: 'battle-wait',
    lobbyLeave: 'lobby-leave',
    appLogout: 'app-logout',

    /** Root marker with data-game-phase / data-game-tick attributes */
    gameSession: 'game-session',
} as const;

export type TestId = (typeof TestIds)[keyof typeof TestIds];

export function campaignTabTestId(tabId: string): string {
    return `${TestIds.campaignTabPrefix}${tabId}`;
}

export function characterCardTestId(characterId: string): string {
    return `${TestIds.characterCardPrefix}${characterId}`;
}

export function missionMapNodeTestId(missionId: string): string {
    return `${TestIds.missionMapNodePrefix}${missionId}`;
}

export function storyChoiceTestId(optionId: string): string {
    return `${TestIds.storyChoicePrefix}${optionId}`;
}
