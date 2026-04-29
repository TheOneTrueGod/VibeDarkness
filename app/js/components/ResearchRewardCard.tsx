import React from 'react';
import ResearchNodeCard, { type ResearchRequirementBadge } from './ResearchNodeCard';
import type { ResearchNodeDef } from '../researchTrees/types';

export interface ResearchRewardCardProps {
    node: ResearchNodeDef;
    state?: 'researched' | 'enabled' | 'blocked' | 'default';
    interactive?: boolean;
    showCost?: boolean;
    showRequirements?: boolean;
    onClick?: () => void;
    selectionReason?: string | null;
    requirementBadges?: ResearchRequirementBadge[];
    className?: string;
}

/**
 * Shared research card used by upgrade trees and reward/result surfaces.
 */
export default function ResearchRewardCard({
    node,
    state = 'researched',
    interactive = false,
    showCost = false,
    showRequirements = false,
    onClick,
    selectionReason = null,
    requirementBadges = [],
    className = '',
}: ResearchRewardCardProps) {
    return (
        <ResearchNodeCard
            node={node}
            variant={interactive ? 'interactive' : 'display'}
            state={state}
            showCost={showCost}
            showRequirements={showRequirements}
            onClick={onClick}
            selectionReason={selectionReason}
            requirementBadges={requirementBadges}
            className={className}
        />
    );
}
