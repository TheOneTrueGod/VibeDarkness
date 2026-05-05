import type { CcTier, CcType } from './ccTypes';

/** Metadata for UI and tooltips (sim stays free of React imports). */
export type CcDefinition = {
    id: CcType;
    tier: CcTier;
    /** Hex colour for chips / HUD (dark-theme contrast). */
    color: string;
    displayName: string;
    description: string;
    /** Stable id for the UI icon map (see `ccBossHudIcons`). */
    iconId: string;
};

export const CC_DEFINITIONS: Record<CcType, CcDefinition> = {
    STUN: {
        id: 'STUN',
        tier: 'hard',
        color: '#f59e0b',
        displayName: 'Stun',
        description: 'Cannot act for a short time.',
        iconId: 'stun',
    },
    KNOCKDOWN: {
        id: 'KNOCKDOWN',
        tier: 'hard',
        color: '#dc2626',
        displayName: 'Knockdown',
        description: 'Knocked down and unable to act.',
        iconId: 'knockdown',
    },
    CRIPPLE: {
        id: 'CRIPPLE',
        tier: 'hard',
        color: '#a855f7',
        displayName: 'Cripple',
        description: 'Severely reduced movement or actions.',
        iconId: 'cripple',
    },
    DISARM: {
        id: 'DISARM',
        tier: 'hard',
        color: '#64748b',
        displayName: 'Disarm',
        description: 'Cannot use weapon abilities.',
        iconId: 'disarm',
    },
    SLOW: {
        id: 'SLOW',
        tier: 'soft',
        color: '#38bdf8',
        displayName: 'Slow',
        description: 'Reduced movement speed.',
        iconId: 'slow',
    },
    CURSE: {
        id: 'CURSE',
        tier: 'soft',
        color: '#c084fc',
        displayName: 'Curse',
        description: 'Ongoing harmful effect.',
        iconId: 'curse',
    },
};
