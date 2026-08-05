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

    /** Admin Players → Campaign data center */
    campaignDataPanel: 'campaign-data-panel',
    campaignDataRow: 'campaign-data-row',
    campaignDataCampaignSelect: 'campaign-data-campaign-select',
    campaignDataDarknessStrengthTab: 'campaign-data-tab-darkness-strength',
    missionHost: 'mission-host',
    missionMapNodePrefix: 'mission-map-node-',

    /** Mission Map quest banks / optional / prep (Campaign Home) */
    missionMapSubTabMap: 'mission-map-subtab-map',
    missionMapSubTabQuests: 'mission-map-subtab-quests',
    questBanksPanel: 'quest-banks-panel',
    /** Inline Continue on the active quest row (Quests panel / bank tooltip). */
    questContinue: 'quest-continue',
    questAbandon: 'quest-abandon',
    questAbandonConfirm: 'quest-abandon-confirm',
    questAbandonCancel: 'quest-abandon-cancel',
    questBankPrefix: 'quest-bank-',
    /** SVG quest-bank node on Mission Map — suffix with bank id */
    missionMapQuestBankPrefix: 'mission-map-quest-bank-',
    questBankTooltip: 'quest-bank-tooltip',
    questStartPrefix: 'quest-start-',
    questStartOptionalPrefix: 'quest-start-optional-',
    /** Optional Character-select header subtitle test id override target. */
    questPrepSubtitle: 'quest-prep-subtitle',
    /** Character-select Quest Prep ability picker root. */
    questPrepAbilityPicker: 'quest-prep-ability-picker',
    questPrepAbilitySlotBar: 'quest-prep-ability-slot-bar',
    missionMarkVictory: 'mission-mark-victory',

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

export function missionMapQuestBankTestId(bankId: string): string {
    return `${TestIds.missionMapQuestBankPrefix}${bankId}`;
}

export function storyChoiceTestId(optionId: string): string {
    return `${TestIds.storyChoicePrefix}${optionId}`;
}
