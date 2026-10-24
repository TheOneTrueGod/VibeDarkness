import React, { useState } from 'react';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleCheck, CircleQuestionMark } from 'lucide-react';
import {
    DEFAULT_PLAN_FILTERS,
    filterPlanSections,
    type PlanBlock,
    type PlanDoc,
    type PlanFilters,
    type PlanItem as PlanItemData,
    type PlanListItem,
    type PlanSection,
    planItems,
} from './plansData';
import PlanFilterBar from './PlanFilterBar';
import PlanSizeChip from './PlanSizeChip';

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g;

/** Renders inline `**bold**` and `` `code` `` within a line of plan text. */
function InlineText({ text }: { text: string }) {
    return (
        <>
            {text.split(INLINE_RE).map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                    return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                    return (
                        <code key={i} className="px-1 py-0.5 rounded bg-surface-light text-[12px] text-primary">
                            {part.slice(1, -1)}
                        </code>
                    );
                }
                return <React.Fragment key={i}>{part}</React.Fragment>;
            })}
        </>
    );
}

function PlanList({ items }: { items: PlanListItem[] }) {
    return (
        <ul className="list-disc pl-5 space-y-1">
            {items.map((item, i) => (
                <li key={i} className="text-sm text-gray-200">
                    <InlineText text={item.text} />
                    {item.children.length > 0 && (
                        <div className="mt-1">
                            <PlanList items={item.children} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

const HEADING_CLASSES: Record<number, string> = {
    1: 'text-xl font-bold text-white mt-6',
    2: 'text-lg font-bold text-white mt-8 pb-1 border-b border-border-custom',
    3: 'text-base font-semibold text-white mt-5',
};

function Block({ block }: { block: PlanBlock }) {
    switch (block.type) {
        case 'heading':
            return (
                <p className={HEADING_CLASSES[block.level] ?? 'text-sm font-semibold text-white mt-4'}>
                    <InlineText text={block.text} />
                </p>
            );
        case 'paragraph':
            return (
                <p className="text-sm text-gray-200 leading-relaxed">
                    <InlineText text={block.text} />
                </p>
            );
        case 'list':
            return <PlanList items={block.items} />;
        case 'rule':
            return <hr className="border-border-custom my-2" />;
        case 'decision':
            return <DecisionCard question={block.question} blocks={block.blocks} />;
    }
}

/** Blue info card for a decision the user needs to make. */
function DecisionCard({ question, blocks }: { question: string; blocks: PlanBlock[] }) {
    return (
        <div className="flex gap-3 rounded-md border border-blue-500/60 bg-blue-900/40 px-4 py-3">
            <CircleQuestionMark className="w-5 h-5 shrink-0 mt-0.5 text-blue-300" aria-hidden />
            <div className="min-w-0 flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">Decision needed</p>
                {question !== '' && (
                    <p className="text-sm font-semibold text-blue-100">
                        <InlineText text={question} />
                    </p>
                )}
                {blocks.map((block, i) => (
                    <Block key={i} block={block} />
                ))}
            </div>
        </div>
    );
}

/**
 * A `###` plan item that can be collapsed. Completed items start collapsed with a green check; the
 * T-shirt size sits at the right of the header so it shows while collapsed.
 */
function PlanItem({
    item: { title, done, size, blocks },
    open,
    onToggle,
}: {
    item: PlanItemData;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="mt-3">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-surface-light"
            >
                <ChevronRight
                    className={`w-4 h-4 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
                    aria-hidden
                />
                {done && <CircleCheck className="w-4 h-4 shrink-0 text-green-400" aria-label="Completed" />}
                <span className={`text-base font-semibold ${done ? 'text-gray-400' : 'text-white'}`}>
                    <InlineText text={title} />
                </span>
                {size != null && (
                    <span className="ml-auto pl-2">
                        <PlanSizeChip size={size} />
                    </span>
                )}
            </button>
            {open && blocks.length > 0 && (
                <div className="mt-2 ml-6 flex flex-col gap-3">
                    {blocks.map((block, i) => (
                        <Block key={i} block={block} />
                    ))}
                </div>
            )}
        </div>
    );
}

/** Open/closed state of a plan's items, keyed by {@link sectionKey}. */
interface ItemOpenState {
    isOpen: (key: string, item: PlanItemData) => boolean;
    toggle: (key: string, item: PlanItemData) => void;
}

function Section({
    section,
    planId,
    sectionId,
    openState,
}: {
    section: PlanSection;
    planId: string;
    sectionId: string;
    openState: ItemOpenState;
}) {
    switch (section.kind) {
        case 'item':
            return (
                <PlanItem
                    item={section}
                    open={openState.isOpen(sectionId, section)}
                    onToggle={() => openState.toggle(sectionId, section)}
                />
            );
        case 'block':
            return <Block block={section.block} />;
        case 'group':
            return (
                <>
                    <Block block={{ type: 'heading', level: 2, text: section.title }} />
                    {section.children.map((child, i) => {
                        const key = sectionKey(planId, child, i);
                        return <Section key={key} section={child} planId={planId} sectionId={key} openState={openState} />;
                    })}
                </>
            );
    }
}

/** Items key by title so their open/closed state survives filtering; other sections key by position. */
function sectionKey(planId: string, section: PlanSection, index: number): string {
    if (section.kind === 'item') return `${planId}-item-${section.title}`;
    if (section.kind === 'group') return `${planId}-group-${section.title}`;
    return `${planId}-block-${index}`;
}

/** Plans tab, right pane: a sticky header (title, date, filters) over the plan's items. */
export default function PlanDetail({ plan }: { plan: PlanDoc | null }) {
    const [filters, setFilters] = useState<PlanFilters>(DEFAULT_PLAN_FILTERS);
    /** Items the user opened or closed; the rest use their default (open unless done). */
    const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
    if (!plan) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No plans found.
            </div>
        );
    }
    const { sections, hiddenCount } = filterPlanSections(plan.sections, filters);
    const openState: ItemOpenState = {
        isOpen: (key, item) => openOverrides[key] ?? !item.done,
        toggle: (key, item) => setOpenOverrides((prev) => ({ ...prev, [key]: !(prev[key] ?? !item.done) })),
    };
    const visibleItems = planItems(sections).map((item) => ({ item, key: sectionKey(plan.id, item, 0) }));
    const anyOpen = visibleItems.some(({ item, key }) => openState.isOpen(key, item));
    const setAllOpen = (open: boolean) =>
        setOpenOverrides((prev) => {
            const next = { ...prev };
            for (const { key } of visibleItems) next[key] = open;
            return next;
        });
    const expandToggle = visibleItems.length > 0 && (
        <button
            type="button"
            onClick={() => setAllOpen(!anyOpen)}
            className="flex items-center gap-1 rounded border border-border-custom px-2 py-0.5 text-xs font-semibold text-gray-300 hover:text-white"
        >
            {anyOpen ? (
                <ChevronsDownUp className="w-3.5 h-3.5" aria-hidden />
            ) : (
                <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden />
            )}
            {anyOpen ? 'Contract all' : 'Expand all'}
        </button>
    );
    return (
        <div className="max-w-4xl select-text">
            <div className="sticky top-0 z-10 bg-surface border-b border-border-custom px-6 pt-3 pb-3">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-xl font-bold text-white">{plan.title}</h2>
                    <p className="text-xs text-muted shrink-0">Added {plan.date}</p>
                </div>
                <div className="mt-2">
                    <PlanFilterBar filters={filters} onChange={setFilters} hiddenCount={hiddenCount} trailing={expandToggle} />
                </div>
            </div>
            <div className="px-6 pb-6 pt-4 flex flex-col gap-3">
                {sections.map((section, i) => {
                    const key = sectionKey(plan.id, section, i);
                    return <Section key={key} section={section} planId={plan.id} sectionId={key} openState={openState} />;
                })}
            </div>
        </div>
    );
}
