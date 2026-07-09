/**
 * Global title bar shown for authenticated users.
 * Username on the left; admin-only CI pill on the right.
 */
import React from 'react';
import { useCurrentUser } from '../user/useCurrentUser';
import CiStatusPill from './CiStatusPill';

export default function AppTitleBar() {
    const { name, isAdmin } = useCurrentUser();

    return (
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-4 py-2">
            <span className="max-w-[45vw] truncate text-xs text-muted pointer-events-auto">{name}</span>
            {isAdmin ? (
                <div className="pointer-events-auto">
                    <CiStatusPill />
                </div>
            ) : null}
        </div>
    );
}
