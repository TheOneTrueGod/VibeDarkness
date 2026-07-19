/**
 * Plain JS mirror of app/js/testing/testIds.ts for Node Playwright scripts.
 * Keep in sync when adding ids.
 */
export const TestIds = {
    loginUsername: 'login-username',
    loginPassword: 'login-password',
    loginSubmit: 'login-submit',
    loginModeToggle: 'login-mode-toggle',
    loginForm: 'login-form',
    campaignTabs: 'campaign-tabs',
    campaignTabPrefix: 'campaign-tab-',
    charactersCreate: 'characters-create',
    charactersLoading: 'characters-loading',
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
    gameSession: 'game-session',
};

export function campaignTabTestId(tabId) {
    return `${TestIds.campaignTabPrefix}${tabId}`;
}

export function characterCardTestId(characterId) {
    return `${TestIds.characterCardPrefix}${characterId}`;
}

export function missionMapNodeTestId(missionId) {
    return `${TestIds.missionMapNodePrefix}${missionId}`;
}

export function storyChoiceTestId(optionId) {
    return `${TestIds.storyChoicePrefix}${optionId}`;
}
