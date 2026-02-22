/**
 * Gray badge showing lobby ID (used in header and recent lobbies list)
 */
interface LobbyIdBadgeProps {
    id: string;
    className?: string;
}

export default function LobbyIdBadge({ id, className = '' }: LobbyIdBadgeProps) {
    return (
        <span
            className={`px-2 py-1 bg-surface-light rounded font-mono text-xs sm:text-sm shrink-0 ${className}`}
        >
            {id}
        </span>
    );
}
