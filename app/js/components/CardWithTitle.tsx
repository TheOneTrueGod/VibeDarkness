import type { ReactNode } from 'react';

/** Default campaign-home / panel card title (Join Mission, Welcome, etc.). */
export const CARD_TITLE_CLASS = 'text-lg font-semibold text-white leading-tight';
/** Characters tab card title — one step smaller so “Name's Characters” matches Join Mission. */
export const CHARACTERS_CARD_TITLE_CLASS = 'text-base font-semibold text-white leading-tight';

interface CardWithTitleProps {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Right-side title-bar content (buttons, selectors). */
    actions?: ReactNode;
    children: ReactNode;
    /** Extra classes on the body. Default: vertical scroll. */
    bodyClassName?: string;
    /** Overrides {@link CARD_TITLE_CLASS} on the heading. */
    titleClassName?: string;
}

/**
 * Full-size titled card: fills its parent, white body text, surface background.
 * Max width belongs on the parent wrapper, not this component.
 */
export default function CardWithTitle({
    title,
    subtitle,
    actions,
    children,
    bodyClassName,
    titleClassName = CARD_TITLE_CLASS,
}: CardWithTitleProps) {
    return (
        <div className="h-full w-full rounded-lg border border-border-custom bg-surface overflow-hidden flex flex-col text-white">
            <div className="px-4 py-3 border-b border-border-custom shrink-0 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className={titleClassName}>{title}</h2>
                    {subtitle != null && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
                </div>
                {actions != null && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
            </div>
            <div className={`flex-1 min-h-0 ${bodyClassName ?? 'overflow-y-auto'}`}>
                {children}
            </div>
        </div>
    );
}
