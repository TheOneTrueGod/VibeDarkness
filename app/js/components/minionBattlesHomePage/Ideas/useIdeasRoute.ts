import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    DEFAULT_IDEAS_VIEW,
    ideasPath,
    parseIdeasSubpath,
    type IdeasViewId,
} from '../../ability-tests/campaignTabPaths';

/**
 * Reads `/campaign/ideas/:view/:itemId` and redirects a missing or unknown view/item to the first item
 * of the view. `itemIds` lists each view's ids in display order.
 */
export function useIdeasRoute(itemIds: Record<IdeasViewId, string[]>): {
    view: IdeasViewId;
    itemId: string | null;
    setView: (view: IdeasViewId) => void;
    selectItem: (itemId: string) => void;
} {
    const navigate = useNavigate();
    const { '*': subpath } = useParams();
    const parsed = parseIdeasSubpath(subpath);
    const view = parsed.view ?? DEFAULT_IDEAS_VIEW;
    const ids = itemIds[view];
    const itemId = parsed.itemId != null && ids.includes(parsed.itemId) ? parsed.itemId : (ids[0] ?? null);

    useEffect(() => {
        if (parsed.view === view && parsed.itemId === itemId) return;
        navigate(ideasPath(view, itemId), { replace: true });
    }, [parsed.view, parsed.itemId, view, itemId, navigate]);

    const setView = useCallback(
        (next: IdeasViewId) => navigate(ideasPath(next, itemIds[next][0] ?? null)),
        [itemIds, navigate],
    );
    const selectItem = useCallback((next: string) => navigate(ideasPath(view, next)), [view, navigate]);

    return { view, itemId, setView, selectItem };
}
