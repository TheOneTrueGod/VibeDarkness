/**
 * Account knowledge pill: type icon + label in a rounded pill; hover shows the type, tier and
 * description. Unregistered keys render as the raw key with the `other` icon.
 */
import React, { useRef, useState } from 'react';
import { Cog, Gem, Sparkles, Swords, type LucideIcon } from 'lucide-react';
import {
    accountKnowledgeDef,
    KNOWLEDGE_TYPE_DEFS,
    type AccountKnowledgeType,
} from '../accountKnowledge';
import { AnchoredPortalTooltip } from '../games/minion_battles/ui/components/AnchoredPortalTooltip';

/** Icons per knowledge type (labels live in `KNOWLEDGE_TYPE_DEFS`, which stays plain TS). */
export const KNOWLEDGE_TYPE_ICONS: Record<AccountKnowledgeType, LucideIcon> = {
    resource: Gem,
    equipment: Swords,
    systems: Cog,
    other: Sparkles,
};

export function KnowledgePill({ knowledgeKey }: { knowledgeKey: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [open, setOpen] = useState(false);
    const def = accountKnowledgeDef(knowledgeKey);
    const Icon = KNOWLEDGE_TYPE_ICONS[def?.type ?? 'other'];
    return (
        <>
            <span
                ref={ref}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[13px] font-semibold bg-surface-light border border-border-custom text-white"
            >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {def?.label ?? knowledgeKey}
            </span>
            <AnchoredPortalTooltip anchorRef={ref} open={open} className="px-2 py-1.5 max-w-[240px] text-xs">
                <p className="font-semibold">{def?.label ?? knowledgeKey}</p>
                {def ? (
                    <>
                        <p className="text-muted">
                            {KNOWLEDGE_TYPE_DEFS[def.type].label} · Tier {def.tier}
                        </p>
                        <p>{def.description}</p>
                    </>
                ) : (
                    <p className="text-muted">Unregistered knowledge key</p>
                )}
            </AnchoredPortalTooltip>
        </>
    );
}
