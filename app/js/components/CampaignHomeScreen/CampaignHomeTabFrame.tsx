import type { ReactNode } from 'react';

/** Default card width for campaign-home tabs (was on PanelLayout). */
export const CAMPAIGN_HOME_CARD_MAX_WIDTH_CLASS = 'max-w-[min(1200px,100%)]';

interface CampaignHomeTabFrameProps {
    children: ReactNode;
    maxWidthClass?: string;
}

/** Centers a full-height card and lets the caller set the card's max width. */
export function CampaignHomeTabFrame({
    children,
    maxWidthClass = CAMPAIGN_HOME_CARD_MAX_WIDTH_CLASS,
}: CampaignHomeTabFrameProps) {
    return (
        <div className="flex justify-center w-full h-[calc(100vh-140px)] min-h-[500px]">
            <div className={`h-full w-full ${maxWidthClass}`}>
                {children}
            </div>
        </div>
    );
}
