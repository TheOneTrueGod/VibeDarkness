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
    missionMapQuestBankPrefix: 'mission-map-quest-bank-',
    missionMapSubTabMap: 'mission-map-subtab-map',
    missionMapSubTabQuests: 'mission-map-subtab-quests',
    questBanksPanel: 'quest-banks-panel',
    questContinue: 'quest-continue',
    questBankTooltip: 'quest-bank-tooltip',
    questStartPrefix: 'quest-start-',
    questStartOptionalPrefix: 'quest-start-optional-',
    questPrepSubtitle: 'quest-prep-subtitle',
    questPrepAbilityPicker: 'quest-prep-ability-picker',
    questPrepAbilitySlotBar: 'quest-prep-ability-slot-bar',
    missionMarkVictory: 'mission-mark-victory',
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

export function missionMapQuestBankTestId(bankId) {
    return `${TestIds.missionMapQuestBankPrefix}${bankId}`;
}

export function storyChoiceTestId(optionId) {
    return `${TestIds.storyChoicePrefix}${optionId}`;
}
