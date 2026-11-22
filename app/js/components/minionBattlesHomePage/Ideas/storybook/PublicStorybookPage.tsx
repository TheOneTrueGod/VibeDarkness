import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PanelLayout from '../../PanelLayout';
import { ideasPath, storybookEntryIdFromPath } from '../../../ability-tests/campaignTabPaths';
import { STORYBOOK_ENTRIES } from './storybookEntries';
import StorybookView, { StorybookEntryList } from './StorybookView';

/**
 * The Storybook for a visitor who is not logged in (`AuthGate` shows it for `/campaign/ideas/storybook/...` URLs),
 * so a link such as `/campaign/ideas/storybook/research-cards?node=mighty&pin=1` works without an account.
 * Logged-in users get the normal Ideas tab at the same URL. Entries only render client-side game data.
 */
export default function PublicStorybookPage() {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const requestedId = storybookEntryIdFromPath(pathname) ?? '';
    const entry = STORYBOOK_ENTRIES.find((e) => e.id === requestedId) ?? STORYBOOK_ENTRIES[0] ?? null;

    // A missing or unknown entry id redirects to the first entry, like the Ideas tab does.
    useEffect(() => {
        if (entry && entry.id !== requestedId) navigate(ideasPath('storybook', entry.id), { replace: true });
    }, [entry, requestedId, navigate]);

    return (
        <div className="h-screen p-4">
            <PanelLayout
                title="Storybook"
                subtitle="Add entries in Ideas/storybook/storybookEntries.ts"
                leftSize="small"
                left={
                    <StorybookEntryList
                        entries={STORYBOOK_ENTRIES}
                        selectedId={entry?.id ?? null}
                        onSelect={(id) => navigate(ideasPath('storybook', id))}
                    />
                }
                center={<StorybookView entry={entry} />}
                centerClassName="overflow-hidden"
            />
        </div>
    );
}
