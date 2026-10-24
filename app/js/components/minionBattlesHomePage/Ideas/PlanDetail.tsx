import React, { useState } from 'react';
import { ChevronRight, CircleCheck, CircleQuestionMark } from 'lucide-react';
import { groupPlanSections, type PlanBlock, type PlanDoc, type PlanListItem } from './plansData';

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

/** A `###` plan item that can be collapsed. Completed items start collapsed with a green check. */
function PlanItem({ title, done, blocks }: { title: string; done: boolean; blocks: PlanBlock[] }) {
    const [open, setOpen] = useState(!done);
    return (
        <div className="mt-3">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
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

/** Plans tab, right pane: the selected plan's title, date and Markdown body. */
export default function PlanDetail({ plan }: { plan: PlanDoc | null }) {
    if (!plan) {
        return (
            <div className="flex items-center justify-center h-full text-muted text-sm">
                No plans found.
            </div>
        );
    }
    return (
        <div className="p-6 max-w-4xl select-text">
            <h2 className="text-xl font-bold text-white">{plan.title}</h2>
            <p className="text-xs text-muted mt-1">Added {plan.date}</p>
            <div className="mt-4 flex flex-col gap-3">
                {groupPlanSections(plan.blocks).map((section, i) =>
                    section.kind === 'item' ? (
                        <PlanItem key={`${plan.id}-${i}`} title={section.title} done={section.done} blocks={section.blocks} />
                    ) : (
                        <Block key={`${plan.id}-${i}`} block={section.block} />
                    ),
                )}
            </div>
        </div>
    );
}
