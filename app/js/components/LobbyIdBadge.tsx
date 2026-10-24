/**
 * Gray badge showing lobby ID (used in header and recent lobbies list). Click to copy.
 */
import CopyableBadge from './CopyableBadge';

interface LobbyIdBadgeProps {
    id: string;
    className?: string;
}

export default function LobbyIdBadge({ id, className = '' }: LobbyIdBadgeProps) {
    return <CopyableBadge value={id} title="Lobby ID" className={className} />;
}
