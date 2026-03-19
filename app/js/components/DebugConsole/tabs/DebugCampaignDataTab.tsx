import React, { useCallback, useEffect, useState } from 'react';
import type { CampaignState } from '../../../types';
import DebugJsonBlock from '../DebugJsonBlock';

interface DebugCampaignDataTabProps {
    isActive: boolean;
    fetchCampaignData: () => Promise<CampaignState | null>;
}

export default function DebugCampaignDataTab({ isActive, fetchCampaignData }: DebugCampaignDataTabProps) {
    const [campaignData, setCampaignData] = useState<CampaignState | null>(null);
    const [campaignDataLoading, setCampaignDataLoading] = useState(false);
    const [campaignDataError, setCampaignDataError] = useState<string | null>(null);
    const [didAttempt, setDidAttempt] = useState(false);

    const loadCampaignData = useCallback(async () => {
        setCampaignDataLoading(true);
        setCampaignDataError(null);
        try {
            const data = await fetchCampaignData();
            setCampaignData(data ?? null);
        } catch (err) {
            setCampaignDataError(err instanceof Error ? err.message : 'Failed to load campaign');
            setCampaignData(null);
        } finally {
            setCampaignDataLoading(false);
            setDidAttempt(true);
        }
    }, [fetchCampaignData]);

    useEffect(() => {
        if (!isActive) return;
        if (didAttempt) return;
        void loadCampaignData();
    }, [isActive, didAttempt, loadCampaignData]);

    if (!isActive) return null;

    return (
        <>
            {campaignDataLoading && <p className="m-0 text-muted text-sm">Loading...</p>}
            {campaignDataError && <p className="m-0 text-red-400 text-sm">{campaignDataError}</p>}
            {!campaignDataLoading && !campaignDataError && (
                <DebugJsonBlock
                    value={campaignData}
                    emptyText="No campaign data (no campaign selected or no campaign IDs)."
                />
            )}
        </>
    );
}

