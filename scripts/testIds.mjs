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
    researchNodesGrid: 'research-nodes-grid',
    researchEligibleSection: 'research-eligible-section',
    researchPossessedSection: 'research-possessed-section',
    researchUnownedSection: 'research-unowned-section',
    researchNodeRequirements: 'research-node-requirements',
    researchNodeTypeIcon: 'research-node-type-icon',
    researchGridResources: 'research-grid-resources',
    missionHost: 'mission-host',
    missionMapNodePrefix: 'mission-map-node-',
    missionMapQuestBankPrefix: 'mission-map-quest-bank-',
    questBankPickerPopup: 'quest-bank-picker-popup',
    questBankPickerClose: 'quest-bank-picker-close',
    questContinue: 'quest-continue',
    questAbandon: 'quest-abandon',
    questAbandonConfirm: 'quest-abandon-confirm',
    questAbandonCancel: 'quest-abandon-cancel',
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
    musicPlayer: 'music-player',
    musicPlayerPlayPause: 'music-player-play-pause',
    musicPlayerSkip: 'music-player-skip',
    musicPlayerReadout: 'music-player-readout',
    musicPlayerVolume: 'music-player-volume',
    musicPlayerMute: 'music-player-mute',
    debugConsoleToggle: 'debug-console-toggle',
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
